-- ============================================================
-- SynCargo — Supabase 스키마 (폼 제출 + 이벤트 + 집계 RPC)
--
-- 적용 방법:
--   Supabase 대시보드 → SQL Editor → 아래 전체를 붙여넣고 RUN.
--   (또는 supabase CLI: supabase db push)
--
-- 쓰기/읽기는 모두 Netlify 서버리스 함수가 service_role 키로 수행합니다.
-- 따라서 RLS는 켜두되 anon/public 정책은 만들지 않습니다(브라우저 직접 접근 차단).
-- service_role 키는 RLS를 우회하므로 함수에서만 동작합니다.
-- ============================================================

-- ---------- 1. 베타 신청 폼 (PII 포함) ----------
create table if not exists public.submissions (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  -- 개인정보(PII)
  company           text,
  name              text,
  email             text,
  phone             text,
  -- 분포 분석용 (비식별)
  role              text,
  company_size      text,
  shipments         text,
  mail_tool         text,
  risks             text[]  not null default '{}',
  context_channels  text[]  not null default '{}',
  churn_experience  text,
  interview_ok      text,
  consent           boolean not null default false
);

create index if not exists submissions_created_idx on public.submissions (created_at desc);

-- ---------- 2. 행동 이벤트 (page_view / scroll_depth / cta_* / form_*) ----------
create table if not exists public.events (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  name        text not null,
  props       jsonb not null default '{}'::jsonb,
  path        text,
  session_id  text
);

create index if not exists events_name_idx    on public.events (name);
create index if not exists events_created_idx  on public.events (created_at);

-- ---------- 3. RLS (브라우저 직접 접근 차단, 함수는 service_role로 우회) ----------
alter table public.submissions enable row level security;
alter table public.events      enable row level security;
-- 정책을 만들지 않음 = anon/authenticated 는 읽기/쓰기 불가. service_role 만 접근.

-- ---------- 4. 집계 RPC (대시보드가 호출) ----------
-- since_ts 이후의 이벤트/제출만 집계. null이면 전체.
create or replace function public.metrics_summary(since_ts timestamptz default null)
returns json
language sql
security definer
stable
set search_path = public
as $$
  select json_build_object(
    'eventCounts', coalesce((
      select json_object_agg(name, c) from (
        select name, count(*) c
        from public.events
        where since_ts is null or created_at >= since_ts
        group by name
      ) t
    ), '{}'::json),

    'scrollDepth', coalesce((
      select json_object_agg(depth, c) from (
        select props->>'depth' as depth, count(*) c
        from public.events
        where name = 'scroll_depth'
          and props ? 'depth'
          and (since_ts is null or created_at >= since_ts)
        group by props->>'depth'
      ) t
    ), '{}'::json),

    'submissions', coalesce((
      select json_agg(s) from (
        select
          created_at as submitted_at,
          company, name, email, phone,
          role, company_size, shipments, mail_tool,
          risks, context_channels, churn_experience, interview_ok
        from public.submissions
        where since_ts is null or created_at >= since_ts
        order by created_at desc
        limit 2000
      ) s
    ), '[]'::json)
  );
$$;

-- RPC 는 함수(service_role) 에서만 호출하므로 anon 실행 권한은 주지 않음.
revoke all on function public.metrics_summary(timestamptz) from anon, authenticated;
