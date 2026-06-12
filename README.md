# SynCargo — 랜딩페이지 & 검증 대시보드

국내 10~50인 포워딩사를 위한 **AI 업무 레이어 "SynCargo"** 의 비공개 베타 모집 랜딩페이지입니다.
Outlook 등 기존 도구를 교체하지 않고, 직원 개인의 메일·기억·메모에 흩어진 화주 관계의 맥락을
**B/L 단위 회사 자산**으로 정리한다는 가치를 제안하고, 방문자의 **유입·전환을 측정**합니다.

> 제품 소개를 넘어, "10~50인 포워딩사 대표가 이 문제에 지갑을 여는가"를 데이터로 검증하기 위한
> 랜딩페이지 + 분석 파이프라인입니다.

## ✨ 특징

- **빌드 없는 바닐라 스택** — `index.html` + `style.css` + `app.js` (프레임워크/번들러 없음)
- **이벤트 트래킹** — PostHog 연동 (방문·스크롤·CTA·폼 퍼널). 키 미설정 시 `localStorage` 백업으로 동작
- **폼 수집** — Formspree 연동 (실패 시 `localStorage` + `mailto` 폴백)
- **검증 대시보드** — Netlify 서버리스 함수가 PostHog를 집계해 `dashboard.html`에 표시 (팀 공유 가능)
- **개인정보 최소 수집** — 회사명·이메일·연락처 등 PII는 **Formspree에만** 저장, PostHog에는 비식별 응답만 전송
- **접근성·반응형** — 모바일 우선, 시맨틱 마크업, 색 대비 고려

## 🗂 파일 구조

```
.
├── index.html            # 랜딩페이지 (Hero·문제·솔루션·기능·ROI·FAQ·폼)
├── style.css             # 디자인 시스템 + 반응형
├── app.js                # track() 래퍼, 이벤트 바인딩, 폼 검증/제출
├── privacy.html          # 개인정보처리방침
├── og-image.svg          # OG 공유 이미지
├── dashboard.html        # 유입·전환 검증 대시보드
├── netlify/
│   └── functions/
│       └── metrics.js     # PostHog 집계 프록시 (비밀 키는 서버 환경변수에만)
└── netlify.toml          # Netlify 설정 (정적 + 함수)
```

## 🔧 설정 (상수 / 환경변수)

### 클라이언트 ([app.js](app.js) 상단 상수)

| 상수 | 설명 |
|---|---|
| `FORM_ENDPOINT` | Formspree 엔드포인트 URL |
| `ANALYTICS_KEY` | PostHog Project API Key (`phc_...`, 공개되어도 무방) |
| `ANALYTICS_HOST` | PostHog 리전 host (US: `https://us.i.posthog.com`) |
| `CONTACT_EMAIL` | 연락 이메일 |

### 서버리스 함수 (Netlify 환경변수 — 비밀)

| 키 | 설명 |
|---|---|
| `POSTHOG_API_KEY` | PostHog Personal API Key (읽기 전용, scope: Query) — **공개 금지** |
| `POSTHOG_PROJECT_ID` | PostHog 프로젝트 ID (숫자) |
| `POSTHOG_HOST` | (선택) 기본 `https://us.posthog.com` |
| `METRICS_SINCE` | (선택) 이 시각(ISO, 예 `2026-06-12T05:17:00Z`) 이후 이벤트만 집계 |

## 🚀 로컬 실행

정적 파일이라 브라우저로 `index.html`을 바로 열면 됩니다. 함수까지 로컬에서 돌리려면:

```bash
npx netlify-cli dev
```

## ☁️ 배포 (Netlify)

1. Netlify에 이 디렉터리를 배포 (드래그&드롭 또는 Git 연동)
2. **Site configuration → Environment variables** 에 위 서버 환경변수 등록
3. 함수가 `/.netlify/functions/metrics` 로 노출되고, `dashboard.html`이 이를 호출

## 📊 대시보드

`dashboard.html` 은 PostHog 전체 방문자 데이터를 집계해 보여줍니다.

- 핵심 지표(방문·CTA·폼) / 전환 퍼널 / 성공 기준 자동 판정
- 폼 응답 분포(직원수·직책/연차·리스크·맥락 등) + 건별 전체 목록(제출 시각 포함)
- `?since=<ISO>` 또는 `METRICS_SINCE` 로 기준 시각 이후만 집계(테스트 데이터 0 처리)
- PostHog 연결 실패 시 현재 기기의 `localStorage` 데이터로 폴백

## 🔒 개인정보

- 수집·이용 항목과 목적은 [privacy.html](privacy.html) 참조
- **회사명·이메일·연락처 등 개인정보(PII)는 Formspree에만 저장**하며, 분석 도구(PostHog)에는
  비식별 응답(직원수·리스크·맥락 등)만 전송합니다.

---

본 서비스는 출시 준비 중이며, 기재된 기능은 베타에서 변경될 수 있습니다.
