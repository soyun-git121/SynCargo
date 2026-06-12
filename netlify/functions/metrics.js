/* ============================================================
   SynCargo — PostHog 집계 프록시 (Netlify 서버리스 함수)
   - 비밀 키(POSTHOG_API_KEY)는 서버 환경변수로만 보관, 공개 페이지에 노출되지 않음
   - dashboard.html이 /.netlify/functions/metrics 를 호출 → 전체 방문자 집계 반환
   - 의존성 0 (Node 18+ 내장 fetch 사용, 번들링 불필요)

   필요한 환경변수 (Netlify → Site configuration → Environment variables):
     POSTHOG_API_KEY     : PostHog Personal API key (읽기 전용, scope: query:read)
     POSTHOG_PROJECT_ID  : 프로젝트 ID (숫자) — PostHog Settings → Project ID
     POSTHOG_HOST        : (선택) 기본 https://us.posthog.com  / EU는 https://eu.posthog.com
   ============================================================ */

const HOST = (process.env.POSTHOG_HOST || "https://us.posthog.com").replace(/\/$/, "");
const KEY = process.env.POSTHOG_API_KEY;
const PROJECT = process.env.POSTHOG_PROJECT_ID;

const EVENT_NAMES = [
  "page_view", "scroll_depth",
  "cta_hero_diagnosis_click", "cta_hero_beta_click", "cta_pricing_click", "cta_roi_diagnosis_click",
  "form_start", "form_submit", "form_abandon"
];

async function hogql(query) {
  const res = await fetch(`${HOST}/api/projects/${PROJECT}/query/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } })
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`PostHog ${res.status}: ${txt.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.results || [];
}

function parseArr(v) {
  if (Array.isArray(v)) return v;
  if (v == null || v === "") return [];
  if (typeof v === "string") {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : [v]; }
    catch (e) { return [v]; }
  }
  return [];
}

exports.handler = async function (event) {
  const json = (code, obj) => ({
    statusCode: code,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(obj)
  });

  if (!KEY || !PROJECT) {
    return json(500, { error: "환경변수 POSTHOG_API_KEY / POSTHOG_PROJECT_ID 가 설정되지 않았습니다." });
  }

  // 기준 시각(cutoff): 이 시각 이후 이벤트만 집계 → 그 전 테스트 데이터는 0 처리.
  // 우선순위: URL ?since=ISO  >  환경변수 METRICS_SINCE. 둘 다 없으면 전체 집계.
  const qsSince = event && event.queryStringParameters && event.queryStringParameters.since;
  let since = qsSince || process.env.METRICS_SINCE || "";
  if (since && !/^[0-9T:\-.Z+ ]{1,30}$/.test(since)) since = ""; // 안전: 허용 문자만
  const sinceClause = since ? ` AND timestamp >= parseDateTimeBestEffort('${since}')` : "";

  try {
    const inList = EVENT_NAMES.map((e) => `'${e}'`).join(",");

    const [counts, scroll, subs] = await Promise.all([
      hogql(`SELECT event, count() FROM events WHERE event IN (${inList})${sinceClause} GROUP BY event`),
      hogql(`SELECT toString(properties.depth), count() FROM events WHERE event = 'scroll_depth'${sinceClause} GROUP BY properties.depth`),
      hogql(
        `SELECT properties.role, properties.company_size, properties.mail_tool, properties.shipments, ` +
        `properties.interview_ok, properties.churn_experience, properties.risks, properties.context_channels, timestamp ` +
        `FROM events WHERE event = 'form_submit'${sinceClause} ORDER BY timestamp DESC LIMIT 2000`
      )
    ]);

    const eventCounts = {};
    counts.forEach((r) => { eventCounts[r[0]] = Number(r[1]) || 0; });

    const scrollDepth = {};
    scroll.forEach((r) => { if (r[0]) scrollDepth[r[0]] = Number(r[1]) || 0; });

    const submissions = subs.map((r) => ({
      role: r[0] || "",
      company_size: r[1] || "",
      mail_tool: r[2] || "",
      shipments: r[3] || "",
      interview_ok: r[4] || "",
      churn_experience: r[5] || "",
      risks: parseArr(r[6]),
      context_channels: parseArr(r[7]),
      submitted_at: r[8] || ""
    }));

    return json(200, { source: "posthog", since: since || null, eventCounts, scrollDepth, submissions, generated_at: new Date().toISOString() });
  } catch (e) {
    return json(502, { error: String((e && e.message) || e) });
  }
};
