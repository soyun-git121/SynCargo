/* ============================================================
   SynCargo — 지표 집계 프록시 (Netlify 서버리스 함수)
   - 비밀 키(SUPABASE_SERVICE_ROLE_KEY)는 서버 환경변수로만 보관, 공개 페이지에 노출되지 않음
   - dashboard.html 이 /.netlify/functions/metrics 를 호출 → 전체 집계 반환
   - Supabase RPC(metrics_summary) 한 번 호출로 eventCounts/scrollDepth/submissions 수신
   - 의존성 0 (Node 18+ 내장 fetch + Supabase REST 사용)

   필요한 환경변수 (Netlify → Site configuration → Environment variables):
     SUPABASE_URL                : https://xxxx.supabase.co
     SUPABASE_SERVICE_ROLE_KEY   : service_role 비밀 키 (읽기에도 사용, 공개 금지)
     METRICS_SINCE               : (선택) 이 시각 이후만 집계 (URL ?since= 가 우선)
   ============================================================ */

const URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function rpc(name, args) {
  const res = await fetch(`${URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(args || {})
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Supabase rpc ${name} ${res.status}: ${txt.slice(0, 300)}`);
  }
  return res.json();
}

exports.handler = async function (event) {
  const json = (code, obj) => ({
    statusCode: code,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(obj)
  });

  if (!URL || !KEY) {
    return json(500, { error: "환경변수 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다." });
  }

  // 기준 시각(cutoff): 이 시각 이후 데이터만 집계 → 그 전 테스트 데이터는 0 처리.
  // 우선순위: URL ?since=ISO  >  환경변수 METRICS_SINCE. 둘 다 없으면 전체 집계.
  const qsSince = event && event.queryStringParameters && event.queryStringParameters.since;
  let since = qsSince || process.env.METRICS_SINCE || "";
  if (since && !/^[0-9T:\-.Z+ ]{1,30}$/.test(since)) since = ""; // 안전: 허용 문자만

  try {
    const d = await rpc("metrics_summary", { since_ts: since || null });

    return json(200, {
      source: "supabase",
      since: since || null,
      eventCounts: (d && d.eventCounts) || {},
      scrollDepth: (d && d.scrollDepth) || {},
      submissions: (d && d.submissions) || [],
      generated_at: new Date().toISOString()
    });
  } catch (e) {
    return json(502, { error: String((e && e.message) || e) });
  }
};
