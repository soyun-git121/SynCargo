/* ============================================================
   SynCargo — 수집 엔드포인트 (Netlify 서버리스 함수)
   - 브라우저(app.js)가 폼 제출 / 행동 이벤트를 이 함수로 POST
   - service_role 키로 Supabase 에 직접 INSERT (키는 서버 환경변수에만 보관)
   - 의존성 0 (Node 18+ 내장 fetch + Supabase REST(PostgREST) 사용)

   필요한 환경변수 (Netlify → Site configuration → Environment variables):
     SUPABASE_URL                : https://xxxx.supabase.co
     SUPABASE_SERVICE_ROLE_KEY   : service_role 비밀 키 (절대 공개 금지)

   요청 본문 형식 (둘 중 하나, 또는 둘 다):
     { "events": [ { "name": "...", "props": {...}, "path": "/", "session_id": "..." }, ... ] }
     { "submission": { ...폼필드... } }
   ============================================================ */

const URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// 허용 이벤트 이름 (그 외는 버림 → 임의 데이터 주입 방지)
const ALLOWED_EVENTS = new Set([
  "page_view", "scroll_depth",
  "cta_hero_diagnosis_click", "cta_hero_beta_click", "cta_pricing_click", "cta_roi_diagnosis_click",
  "form_start", "form_submit", "form_abandon"
]);

// 폼에서 받을 컬럼 화이트리스트 (그 외 필드는 저장 안 함)
const STR_FIELDS = ["company", "name", "email", "phone", "role", "company_size", "shipments", "mail_tool", "churn_experience", "interview_ok"];
const ARR_FIELDS = ["risks", "context_channels"];

function clampStr(v, max) {
  if (v == null) return null;
  var s = String(v);
  return s.length > max ? s.slice(0, max) : s;
}
function clampArr(v, max, itemMax) {
  if (!Array.isArray(v)) return [];
  return v.slice(0, max).map(function (x) { return clampStr(x, itemMax); }).filter(Boolean);
}

async function insert(table, rows) {
  if (!rows.length) return;
  const res = await fetch(`${URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify(rows)
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Supabase ${table} ${res.status}: ${txt.slice(0, 300)}`);
  }
}

exports.handler = async function (event) {
  const json = (code, obj) => ({
    statusCode: code,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(obj)
  });

  if (event.httpMethod !== "POST") return json(405, { error: "POST only" });
  if (!URL || !KEY) return json(500, { error: "환경변수 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다." });

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch (e) { return json(400, { error: "invalid JSON" }); }

  try {
    // ---- 이벤트 (배치) ----
    const eventRows = [];
    if (Array.isArray(body.events)) {
      body.events.slice(0, 50).forEach(function (ev) {
        if (!ev || !ALLOWED_EVENTS.has(ev.name)) return;
        let props = {};
        if (ev.props && typeof ev.props === "object") {
          // props 크기 제한 (직렬화 8KB 초과 시 버림)
          try { if (JSON.stringify(ev.props).length <= 8192) props = ev.props; } catch (e) {}
        }
        eventRows.push({
          name: ev.name,
          props: props,
          path: clampStr(ev.path, 300),
          session_id: clampStr(ev.session_id, 64)
        });
      });
    }

    // ---- 폼 제출 ----
    let submissionRow = null;
    if (body.submission && typeof body.submission === "object") {
      const s = body.submission;
      submissionRow = {};
      STR_FIELDS.forEach(function (k) { submissionRow[k] = clampStr(s[k], 500); });
      ARR_FIELDS.forEach(function (k) { submissionRow[k] = clampArr(s[k], 20, 200); });
      submissionRow.consent = s.consent === true;
    }

    await Promise.all([
      insert("events", eventRows),
      submissionRow ? insert("submissions", [submissionRow]) : Promise.resolve()
    ]);

    return json(200, { ok: true, events: eventRows.length, submission: submissionRow ? 1 : 0 });
  } catch (e) {
    return json(502, { error: String((e && e.message) || e) });
  }
};
