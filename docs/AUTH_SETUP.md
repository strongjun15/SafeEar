# 로그인 설정 — 이메일 회원가입 + Google 로그인

SafeEar 계정은 **Supabase**(관리형 백엔드, 계획서 14.6절)로 만든다. 코드는 다 들어 있고,
아래는 **사람이 직접 해야 하는 설정**이다. 처음 한 번만 하면 된다 (30분 정도).

> 서버 설정이 없어도 앱은 「로그인 없이 사용」으로 이 PC 안에서 모든 기능이 동작한다.
> 메뉴 이름은 Supabase · Google 콘솔 개편에 따라 조금씩 다를 수 있다. 이름이 다르면 비슷한 메뉴를 찾으면 된다.

전체 흐름:

```
[1] Supabase 프로젝트 만들기 ─▶ [2] DB 스키마 적용 ─▶ [3] 이메일 로그인 설정
        │
        └▶ [4] Google Cloud에서 OAuth 클라이언트 만들기 ─▶ [5] Supabase에 Google 켜기
                                                              │
                                    [6] 앱의 .env에 주소·키 넣고 빌드 ◀┘
```

---

## [1] Supabase 프로젝트 만들기

1. <https://supabase.com> 가입 → **New project**
2. **Region: Northeast Asia (Seoul)** 을 고른다
   - 해외 리전을 쓰면 개인정보 처리방침에 국외 이전 고지가 필요하다 (계획서 14.5절)
3. DB 비밀번호는 안전한 곳에 적어 둔다 (앱에는 넣지 않는다)

## [2] DB 스키마 적용

1. Supabase 대시보드 → **SQL Editor** → New query
2. `server/supabase/migrations/20261019000000_init.sql` 내용을 통째로 붙여 넣고 **Run**
3. **Table Editor**에 `profiles`, `devices`, `minute_records` 세 테이블이 생겼는지 확인

> Supabase CLI를 쓴다면 `supabase link` 후 `supabase db push`로도 된다.

이 스키마가 하는 일:
- 모든 테이블에 **"본인 행만 읽고 쓸 수 있다"** 규칙(RLS)을 건다
- 가입하면 `profiles` 행을 자동으로 만든다 (Google 이름도 가져옴)
- `delete_my_account()` — 앱의 「회원 탈퇴」가 계정과 모든 기록을 지운다
- `account_minutes(since)` — 여러 기기 기록을 분 단위로 합친 타임라인 (나중에 웹 대시보드용)

## [3] 이메일 로그인 설정

대시보드 → **Authentication**

| 메뉴 | 설정 |
|---|---|
| **URL Configuration → Site URL** | `http://127.0.0.1:51789/auth/callback` |
| **URL Configuration → Redirect URLs** | `http://127.0.0.1:51789/**` 추가 |
| **Sign In / Providers → Email** | 켜기 (기본값). **Confirm email** 켜 두기 권장 |
| **Password** 최소 길이 | 8 (앱도 8자 이상만 받음) |

왜 `127.0.0.1:51789`인가: 데스크톱 앱은 웹사이트 주소가 없다. 그래서 앱이 이 PC 안에 작은 서버를 열고
기다리다가, 로그인·인증 메일 링크가 이 주소로 돌아오면 바로 로그인시킨다 (RFC 8252 "루프백" 방식 + PKCE).
포트를 바꾸려면 `.env`의 `SAFEEAR_AUTH_PORT`와 위 두 칸을 같이 바꾼다.

**인증 메일**
- 같은 PC에서 메일 링크를 누르면 앱이 자동으로 로그인된다
- 휴대폰에서 누르면 페이지는 안 열리지만 인증은 끝난 상태다 → 앱에서 이메일·비밀번호로 로그인하면 된다
- ⚠ Supabase 기본 메일 발송은 **시간당 몇 통**으로 제한된다. 팀원 테스트에는 충분하지만, 학급 단위 이상으로
  쓰려면 **Authentication → Emails → SMTP Settings**에 Gmail·네이버 등 SMTP를 연결한다
- **Emails → Templates**에서 인증 메일 문구를 한국어로 바꿀 수 있다

## [4] Google Cloud에서 OAuth 클라이언트 만들기

1. <https://console.cloud.google.com> → 새 프로젝트 (예: `safeear`)
2. **Google Auth Platform**(예전 이름: *APIs & Services → OAuth consent screen*)으로 이동
   - **Branding**: 앱 이름 `SafeEar`, 사용자 지원 이메일, 개발자 연락처 이메일
     (로고를 넣으면 Google 검토가 필요할 수 있으니 처음엔 비워 둔다)
   - **Audience**: User type **External**
     - 처음에는 **Testing** 상태 → **Test users**에 팀원 Google 계정을 추가해야 그 사람들만 로그인할 수 있다 (최대 100명)
     - 팀원 밖으로 열 때 **Publish app**. 이메일·프로필 범위만 쓰므로 보통 별도 심사 없이 게시된다
   - **Data access**(범위): `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` — 기본 범위만 쓴다
3. **Clients → Create client**
   - Application type: **Web application** ← "데스크톱 앱"이 아니라 웹이다. Google로 돌아가는 곳이 Supabase 서버이기 때문
   - **Authorized redirect URIs**: `https://<프로젝트-ref>.supabase.co/auth/v1/callback`
     - 정확한 주소는 Supabase **Authentication → Sign In / Providers → Google** 화면의 *Callback URL*을 복사해 쓴다
4. 만들어진 **Client ID**와 **Client secret**을 복사한다

## [5] Supabase에 Google 켜기

대시보드 → **Authentication → Sign In / Providers → Google**
- **Enable** 켜기
- Client ID / Client Secret 붙여 넣기 → Save

같은 이메일로 이메일 가입과 Google 로그인을 둘 다 하면, 이메일 인증이 끝난 계정끼리는 Supabase가 자동으로 하나로 묶는다.

## [6] 앱에 서버 주소 넣고 빌드

1. 대시보드 → **Project Settings → API**(또는 *Data API / API Keys*)에서
   - **Project URL** (`https://xxxx.supabase.co`)
   - **anon public** 키 또는 **publishable** 키 (`sb_publishable_...`)
2. `collector-desktop/.env.example`을 `collector-desktop/.env`로 복사하고 두 값을 채운다
3. `npm run desktop` (개발 실행) 또는 `npm run desktop:dist` (설치 파일)

> **anon/publishable 키는 앱에 들어가도 되는 공개 키다.** 데이터는 [2]의 RLS 규칙이 지킨다.
> **service_role / secret 키는 절대 앱이나 git에 넣지 않는다.** `.env`는 `.gitignore`에 들어 있다.

---

## 확인 체크리스트

- [ ] 앱 첫 화면에 "서버 설정이 아직 없어요" 안내가 **안** 보인다
- [ ] 이메일로 가입 → 인증 메일 → (같은 PC에서) 링크 클릭 → 앱이 자동 로그인
- [ ] 「Google로 계속하기」 → 브라우저에서 계정 선택 → "로그인했어요" 페이지 → 앱 로그인 완료
- [ ] 몇 분 들은 뒤 Supabase **Table Editor → minute_records**에 1분마다 한 줄씩 쌓인다
- [ ] 다른 PC에서 같은 계정으로 로그인 → 「기기별 기여」에 두 기기가 보인다
- [ ] 프로필 → 회원 탈퇴 → `auth.users`, `minute_records`에서 그 계정 행이 사라진다

## 자주 나는 오류

| 앱에 뜨는 말 | 원인 / 해결 |
|---|---|
| 구글 로그인이 아직 서버에서 켜져 있지 않아요 | [5]를 안 했거나 Save를 안 누름 |
| 로그인 주소가 허용 목록에 없어요 | [3]의 Redirect URLs에 `http://127.0.0.1:51789/**`가 없음 |
| 브라우저에 Google `redirect_uri_mismatch` | [4]의 Authorized redirect URI가 Supabase Callback URL과 다름 |
| Google "액세스 차단됨: 앱이 테스트 중" | [4] Audience의 Test users에 그 계정을 추가하거나 Publish |
| 로그인용 포트 51789를 다른 프로그램이 쓰고 있어요 | 그 프로그램을 끄거나 포트를 바꿈 (`.env` + [3] 같이) |
| 메일함에서 인증 링크를 먼저 눌러 주세요 | 인증 메일의 링크를 누른 뒤 다시 로그인 |
| 요청이 너무 많아요 | 기본 메일 발송 한도 초과 → 1시간 뒤 다시, 또는 SMTP 연결 |

## 나중에 iOS 앱을 낼 때 (참고)

App Store 심사 지침 4.8: 앱에 Google 같은 외부 로그인을 넣으면 **Sign in with Apple** 등 동등한 선택지를
요구받을 수 있다 (계획서 14.5절). Supabase는 Apple 로그인도 같은 방식으로 켤 수 있다.
