-- SafeEar 초기 스키마 — 계정 기반 다기기 누적 (계획서 14절)
--
--  profiles        계정 프로필 (이름, 나이대, H.870 모드)
--  devices         계정의 기기 목록 (폰 · 패드 · PC)
--  minute_records  1분 요약 레코드 (14.2절) — 원시 오디오는 절대 올리지 않는다
--
-- 모든 테이블에 행 단위 접근 규칙(RLS): "본인 행만 읽고 쓸 수 있다" (14.5절)

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text check (char_length(display_name) <= 40),
  age_band      text check (age_band in ('14-17', '18-19', '20s', '30plus')),
  hearing_mode  smallint check (hearing_mode in (1, 2)),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- 만 18세 미만은 Mode 2 고정 (계획서 3.5절)
  constraint minors_use_mode2 check (age_band is distinct from '14-17' or hearing_mode is distinct from 1)
);

comment on table public.profiles is 'SafeEar 계정 프로필. 실명·학교·전화번호는 받지 않는다 (14.5절 수집 최소화).';

-- ---------------------------------------------------------------- devices
create table public.devices (
  id            uuid primary key,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name          text not null check (char_length(name) <= 80),
  platform      text not null check (platform in ('windows', 'mac', 'android', 'ios', 'ipados', 'web')),
  app_version   text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

create index devices_user_idx on public.devices (user_id);

-- ---------------------------------------------------------------- minute_records
create table public.minute_records (
  device_id             uuid not null references public.devices (id) on delete cascade,
  minute_start          timestamptz not null,
  user_id               uuid not null default auth.uid() references auth.users (id) on delete cascade,
  output_id             text check (char_length(output_id) <= 200),
  output_type           text not null check (output_type in ('headphones', 'speaker', 'unknown')),
  tier                  char(1) not null check (tier in ('A', 'B', 'C', 'D')),
  listen_seconds        smallint not null check (listen_seconds between 0 and 60),
  laeq_db               real,
  dose_eeh              double precision not null check (dose_eeh >= 0),
  dose_kurt             double precision check (dose_kurt >= 0),
  beta                  real,
  band_dose             double precision[] check (band_dose is null or array_length(band_dose, 1) = 19),
  volume_index          real check (volume_index between 0 and 100),
  content_label         text check (content_label in ('music', 'video', 'game', 'call', 'browser', 'other')),
  app_name              text check (char_length(app_name) <= 80),
  calib_profile_id      text,
  calib_uncertainty_db  real,
  schema_version        smallint not null default 1,
  app_version           text,
  -- 기기 시계 오차를 잡기 위한 서버 수신 시각 (14.3절 #5)
  received_at           timestamptz not null default now(),
  -- 같은 레코드를 여러 번 보내도 중복되지 않는다 (14.3절 #6)
  primary key (device_id, minute_start),
  constraint minute_aligned check (date_trunc('minute', minute_start) = minute_start)
);

create index minute_records_user_time_idx on public.minute_records (user_id, minute_start);

comment on table public.minute_records is '1분 요약 레코드 (계획서 14.2절). 원시 오디오·1초 값은 저장하지 않는다. 추가만 하고 수정하지 않는다.';

-- ---------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.devices enable row level security;
alter table public.minute_records enable row level security;

create policy "profiles: 본인만 읽기" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "profiles: 본인만 만들기" on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy "profiles: 본인만 고치기" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "devices: 본인만 읽기" on public.devices for select to authenticated using (user_id = (select auth.uid()));
create policy "devices: 본인만 등록" on public.devices for insert to authenticated with check (user_id = (select auth.uid()));
create policy "devices: 본인만 고치기" on public.devices for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "devices: 본인만 지우기" on public.devices for delete to authenticated using (user_id = (select auth.uid()));

create policy "records: 본인만 읽기" on public.minute_records for select to authenticated using (user_id = (select auth.uid()));
-- 올릴 때는 그 기기도 본인 것이어야 한다
create policy "records: 본인 기기로만 올리기" on public.minute_records for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.devices d where d.id = device_id and d.user_id = (select auth.uid()))
  );
create policy "records: 본인만 지우기" on public.minute_records for delete to authenticated using (user_id = (select auth.uid()));
-- update 정책은 두지 않는다: 레코드는 추가만 한다

revoke all on public.profiles, public.devices, public.minute_records from anon;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.devices to authenticated;
grant select, insert, delete on public.minute_records to authenticated;

-- ---------------------------------------------------------------- 가입하면 프로필 자동 생성
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ), 40)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- 회원 탈퇴: 계정과 모든 기록 삭제 (14.5절)
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  -- profiles / devices / minute_records는 on delete cascade로 함께 지워진다
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------- 병합 타임라인 (14.3절)
-- 같은 계정의 모든 기기 기록을 분 단위로 합친다. 스피커 제외, 같은 분 겹침은 큰 값 + 겹침 표시 (9절 #9).
-- 웹 대시보드나 분석에서 쓴다. 호출한 사람의 RLS가 그대로 적용된다 (security invoker).
create or replace function public.account_minutes(since timestamptz)
returns table (
  minute_start    timestamptz,
  dose_eeh        double precision,
  dose_kurt       double precision,
  listen_seconds  smallint,
  device_count    integer,
  overlap         boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    r.minute_start,
    max(r.dose_eeh),
    max(coalesce(r.dose_kurt, r.dose_eeh)),
    max(r.listen_seconds),
    count(distinct r.device_id)::integer,
    count(distinct r.device_id) > 1
  from public.minute_records r
  where r.user_id = (select auth.uid())
    and r.minute_start >= since
    and r.output_type <> 'speaker'
  group by r.minute_start
  order by r.minute_start;
$$;

grant execute on function public.account_minutes(timestamptz) to authenticated;
