# server — Supabase 스키마

서버를 직접 운영하지 않고 Supabase(인증 · PostgreSQL · 행 단위 접근 규칙)를 쓴다 (계획서 14.6절).

- `supabase/migrations/20261019000000_init.sql` — 테이블 3개(`profiles`, `devices`, `minute_records`), RLS, 가입 트리거, `delete_my_account()`, `account_minutes()`
- 적용 방법과 Google 로그인 설정: [`../docs/AUTH_SETUP.md`](../docs/AUTH_SETUP.md)

스키마를 바꿀 때는 기존 파일을 고치지 말고 `supabase/migrations/`에 날짜가 붙은 새 파일을 추가한다.
레코드 형식을 바꾸면 `core/src/records.ts`의 `MinuteRecord`와 `SCHEMA_VERSION`도 함께 바꾼다.
