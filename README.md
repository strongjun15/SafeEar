# SafeEar

> 이어폰 사용에 따른 실시간 청각 피로도 추정 앱 — 경기북과학고 팀 Nabla

컴퓨터에서 나오는 모든 소리를 백그라운드에서 분석해, 국제표준(ITU-T H.870, ISO 1999)과 논문 보정식으로
**최근 7일 귀 피로도**를 계산한다. 계정으로 로그인하면 휴대폰 · 태블릿 · 다른 PC에서 들은 소리와 합쳐
**한 사람의 귀 기준**으로 계산한다.

설계 근거: [`docs/SafeEar_개발계획_v3.md`](docs/SafeEar_개발계획_v3.md) · 구현 결정: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · 로그인 설정: [`docs/AUTH_SETUP.md`](docs/AUTH_SETUP.md)

## 저장소 구조 (계획서 16.3절)

```
SafeEar/
├─ core/                # 공통 계산 (TypeScript) — 오디오 API 의존 없음
│   └─ src/             #   A-가중 · FFT · 1/3옥타브 · 첨도 · H.870 선량 · 2-τ 회복 · ISO 1999 · 1분 레코드 · 병합
├─ test-vectors/        # 골든 WAV + expected.json — 모든 플랫폼 구현이 통과해야 함 (V8)
├─ collector-desktop/   # 윈도우 앱 (Electron)
│   ├─ src/engine/      #   숨김 창: WASAPI loopback 캡처 + 1초 특징 추출
│   ├─ src/main/        #   측정 파이프라인 · 저장 · 동기화 · 로그인 · 트레이 · 알림
│   ├─ src/ui/          #   화면 (목업 v2)
│   └─ native/          #   윈도우 볼륨 · 출력 장치 · 재생 앱을 읽는 PowerShell 도우미
├─ server/              # Supabase DB 스키마 · 접근 규칙(RLS)
└─ docs/                # 계획서 · 목업 · 구조 · 로그인 설정
```

## 윈도우 앱 실행

필요한 것: Windows 10/11, [Node.js 22 LTS](https://nodejs.org)

```powershell
git clone https://github.com/strongjun15/SafeEar.git
cd SafeEar
npm install
npm test               # core 계산 테스트
npm run desktop        # 앱 실행 (개발 모드)
npm run desktop:dist   # 설치 파일 만들기 → collector-desktop/release/
```

- 처음 실행하면 로그인 화면이 뜬다. 서버를 아직 설정하지 않았다면 **「로그인 없이 사용」**으로 바로 쓸 수 있다.
- 창을 닫아도 **알림 영역(트레이)**에서 계속 측정한다. 트레이 아이콘 우클릭 → 일시정지 / 자동 실행 / 종료.
- 설치판은 윈도우 시작 시 자동으로 트레이에서 실행된다 (설정에서 끌 수 있음).
- 윈도우가 아닌 PC에서 화면만 보려면:
  - `npm run preview -w collector-desktop` → `collector-desktop/dist/preview.html`을 아무 브라우저로 열기 (가짜 데이터, 설치 불필요)
  - `SAFEEAR_DEMO_AUDIO=1 npm run desktop` (Electron 앱을 합성 소리로 실행)

## 무엇을 계산하나

| 화면 | 내용 | 근거 |
|---|---|---|
| 오늘 | SafeEar % (첨도 보정 + 회복) 링, 실시간 파형 · 추정 dBA · 윈도우 볼륨 · 재생 앱, 이중 게이지(기존 방식 마커), 기기별 기여, 피로 곡선 | H.870, Goley/Zhang, Patuzzi |
| 귀 지도 | 1/3 옥타브 19대역 부담 (3~6 kHz 강조) | 토노토피, 3.3절 |
| 회복 | 10분~2시간 쉬면 몇 %로 내려가는지 + 휴식 타이머 | 2-τ 회복 적분기 |
| 10년 뒤 | ISO 1999 예측 청력 변화를 EQ로 걸어 들려주기 (데모 소리 / 내 음악 파일) | ISO 1999:2013 |
| 리포트 | 요일×시간 히트맵, 앱별 부담, 볼륨 추세 | — |

**소리는 녹음 · 저장 · 전송하지 않는다.** 1초마다 숫자 몇 개로 바꾼 뒤 버리고, 서버에는 1분 요약값만 올라간다 (동기화를 켠 경우).
의료기기가 아니며 진단하지 않는다.

## 로그인 (이메일 + Google)

코드는 완성돼 있고, Supabase 프로젝트와 Google OAuth 클라이언트는 **직접 만들어야 한다** → [`docs/AUTH_SETUP.md`](docs/AUTH_SETUP.md)
