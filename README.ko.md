# 초대장 메이커

브라우저에서 초대장을 만들고, 독립 HTML로 저장하거나 공개 링크로 발행할 수 있는 정적 우선 초대장 제작기입니다. 제작 데이터는 브라우저에 보관하고, 공개 발행을 선택한 경우에만 정규화된 초대장 스냅샷을 MongoDB에 저장합니다.

## 제공 기능

- 생일, 결혼, 기념일, 행사 등 행사별 템플릿 선택
- 실시간 미리보기와 독립 실행형 HTML 다운로드
- 사진을 Base64/WebP로 포함한 단일 HTML export
- 브라우저 IndexedDB 기반 초안 및 로컬 초대장 보관
- Base62 공개 ID를 사용하는 익명 초대장 발행
- 발행 초대장 조회 및 제작자 토큰 기반 삭제
- 로컬 관리자 서비스의 목록, 검색, 페이지네이션, 상세, 강제 폐기
- 제작기·공개 뷰어·관리자 화면의 한국어/영어 다국어 지원, 외부 라이브러리 없이 `Intl` 기반 날짜/숫자 포맷
- GA4/PostHog 선택적 분석 설정
- 랜딩 페이지는 검색 노출, 발행된 개별 초대장은 의도적으로 검색 노출 제외

## 서비스 구조

![초대장 메이커 Archify 구조도](docs/architecture/archify/system.visual-check.2048x1320.light.png)

[Archify 인터랙티브 구조도](docs/architecture/archify/system.html) · [원본 JSON과 재생성 방법](docs/architecture/archify/README.md)

```text
초대장 메이커
├── 제작기        index.html + assets/
├── 공개 뷰어      shared.html
├── 공개 API       api/ + server/
├── 로컬 관리자    admin/
├── 공개 산출물    public/
└── 문서/설계      docs/
```

자세한 경계와 리팩토링 진척은 [`docs/architecture/README.md`](docs/architecture/README.md)를 참고하세요. 계획했던 리팩토링은 5단계 모두 코드에 반영되어 완료되었습니다. 원본 Mermaid 다이어그램은 [`docs/architecture/diagrams/`](docs/architecture/diagrams/)에 있습니다.

## 빠른 시작

Node.js 22 이상을 사용합니다.

```bash
npm ci
cp .env.example .env
npm start
```

제작 화면은 [http://127.0.0.1:4173](http://127.0.0.1:4173)에서 엽니다. 정적 제작 화면만 확인할 때는 다음 명령도 사용할 수 있습니다.

```bash
python3 -m http.server 4173
```

`npm start`, `npm run admin`, `npm run dev`, `npm run dev:admin`은 모두 로컬 개발자용 명령이며, 그중 어느 것도 운영 환경에서 실행되지 않습니다. 운영 환경은 `server/index.cjs`를 전혀 실행하지 않고, `api/*.js` 서버리스 함수와 `scripts/build-public.cjs`를 통해 배포되며, 설정은 전적으로 Vercel의 환경 변수에서 옵니다. 별도의 로컬 설정(예: 다른 로컬 데이터베이스)이 필요하면 `.env.example`을 `.env.dev`로 복사하고 `npm run dev`(관리자 서비스는 `npm run dev:admin`)를 사용하세요. `npm start`/`npm run admin`은 기존대로 `.env`를 사용합니다. `.env`와 `.env.dev` 모두 자신의 로컬 환경을 가리켜야 하며, 두 진입점 모두 시작 시 연결할 데이터베이스 이름과 호스트를 출력하고, 호스트가 로컬(loopback)이 아니면 눈에 띄게 경고합니다.

## 제작기 화면 구성

미리보기는 페이지에 직접 삽입되지 않고 `srcdoc` iframe 안에서 렌더링됩니다. 초대장 자체의 제목 구조가 제작기의 문서 구조에 섞이지 않고, 손님이 실제로 받는 것과 동일한 standalone 문서를 그대로 렌더링하므로 미리보기가 실제 결과물과 어긋날 일이 없습니다. 긴 폼을 편집하는 동안에도 화면에 고정되어 보입니다. 갤러리·편집·완성 세 단계는 하나의 정렬 기준을 공유해 단계를 옮겨도 레이아웃이 흔들리지 않습니다. 완성 단계는 대등한 세 가지 선택지 — 보관함에 저장, 파일로 저장, 링크로 공유 — 를 제공하며, 뒤의 두 가지는 무엇을 얻는지 설명하는 대화상자(`<dialog>`)를 엽니다: 보관함은 이 브라우저에만 남고, 발행된 링크는 브라우저를 지워도 계속 열리지만 그 링크를 취소할 수 있는 권한은 이 브라우저에만 남는다는 점입니다.

## 다국어 지원

제작기, 공개/공유 뷰어, 다운로드한 standalone HTML은 별도 라이브러리나 번들러 없이 한국어/영어를 지원합니다 — `assets/i18n/` 아래의 사전 파일과 `data-i18n` 속성만으로 동작합니다. 언어는 `?lang=` 명시적 지정 → 저장된 선택 → 방문자의 브라우저 언어 → 기본값(한국어) 순서로 결정되며, `<html lang>`과 생성/샘플 날짜(`Intl` 기반)가 이를 따릅니다. **초대장의 저작 콘텐츠는 절대 번역되지 않으며, 그 주변의 화면 문구(chrome)만 언어를 따릅니다.** 영어 브라우저를 쓰는 손님이 한국어로 작성된 초대장의 공개 링크를 열면, 로딩/오류 문구는 영어로 보이지만 초대장 본문은 작성된 한국어 그대로 보입니다. 다운로드한 파일은 내보내는 순간의 언어로 화면 문구가 고정됩니다. 사전 구조, 언어 추가 방법, 저작 콘텐츠와 chrome을 구분하는 전체 규칙은 [i18n 문서](docs/i18n.md)를 참고하세요.

## 공개 발행 서버

공개 발행 API는 MongoDB 연결이 필요합니다. `.env`에 다음 값을 설정합니다.

```dotenv
MONGODB_URI=mongodb://...
MONGODB_DB=invitation_maker
PUBLISH_ALLOWED_ORIGIN=http://127.0.0.1:4173
```

주요 공개 API는 다음과 같습니다.

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| `POST` | `/api/invitations` | 정규화된 초대장 발행 |
| `GET` | `/api/invitations/:id` | 공개 초대장 조회 |
| `DELETE` | `/api/invitations/:id` | 제작자 토큰으로 발행 취소 |

발행 성공 시 `/i/{base62-id}` 링크를 반환합니다. 시간당/IP별 제한, 일일 제한, 누적 제한이 적용됩니다. 만료는 슬라이딩 방식입니다. 마지막 조회로부터 `PUBLISH_IDLE_WINDOW_DAYS`(기본 7일) 동안 유지되며, 발행 시점으로부터 `PUBLISH_MAX_LIFETIME_DAYS`(기본 30일)를 넘지 않습니다. 데이터베이스는 더 이상 자동으로 삭제하지 않습니다. 만료 시각은 표시일 뿐이며 조회 경로가 이를 강제하므로, 만료된 링크는 `404`를 반환하지만 레코드 자체는 관리자나 별도 일괄 삭제 작업을 위해 그대로 남아 있습니다.

상세 운영 규칙은 [`docs/publishing.md`](docs/publishing.md)에 있습니다.

## 로컬 관리자

관리자 서비스는 공개 서버와 별도 프로세스로 실행하며 Vercel 공개 산출물에 포함되지 않습니다. `admin/public/`(HTML/CSS/JS)은 이제 Git에 커밋되어 있습니다 — 예전에는 `.gitignore`의 `public/` 규칙이 모든 깊이에 매칭되어 이 디렉토리가 조용히 추적에서 빠졌고, 그 결과 새로 clone한 저장소의 관리자 서버는 화면 없이 떴습니다. 규칙을 `/public/`로 앵커링해 저장소 루트의 빌드 산출물만 무시하도록 고쳤습니다.

```bash
ADMIN_PASSWORD='change-me' npm run admin
```

`npm run dev:admin`은 별도의 로컬 설정을 위해 `.env` 대신 `.env.dev` 파일을 읽습니다. 두 파일 중 어느 쪽이든 의도적으로 원격 데이터베이스를 가리킬 수 있습니다 — 이 경우 `MONGODB_URI`가 로컬(loopback)이 아니면 관리자 서비스가 시작 시 눈에 띄는 경고를 출력합니다. 관리자 서비스의 폐기 작업은 실제 데이터에 영향을 주기 때문입니다.

관리자 화면:

```text
http://127.0.0.1:4174/admin
```

관리자 기능:

- 비밀번호 로그인 및 메모리 세션
- 발행 ID/제목 검색
- 페이지 크기 1~100 범위의 서버 페이지네이션
- 발행 상세 확인
- 공개 링크 열기
- 관리자 강제 폐기

`ADMIN_HOST` 기본값은 `0.0.0.0`이며, 다른 기기에서 접근하는 경우 HTTPS를 제공하는 프록시 뒤에서 사용해야 합니다. 세션은 관리자 프로세스가 재시작되면 만료됩니다.

세션 쿠키는 요청이 실제로 HTTPS일 때만 `Secure` 속성을 붙입니다. 직접 TLS로 연결된 경우는 자동으로 감지하지만, Cloudtype처럼 앞단 프록시가 TLS를 종료하는 배포에서는 이를 알 수 없습니다 — 유일한 신호는 `x-forwarded-proto` 헤더인데, 이 헤더는 위조 가능하므로 명시적으로 허용하지 않는 한 신뢰하지 않습니다. **이런 프록시 뒤에서 운영한다면 반드시 `ADMIN_TRUST_PROXY=true`를 설정하세요.** 그렇지 않으면 세션 쿠키에 `Secure`가 빠져 평문으로 전송될 수 있습니다. 기본값은 `false`이며, 꺼져 있는 동안에는 관리자 서비스가 시작 시 경고를 출력합니다.

## 분석 설정

GA4는 `assets/analytics/config.js`의 유효한 Measurement ID와 활성 설정이 있을 때만 동작합니다. 로컬/미리보기 호스트에서는 기본적으로 이벤트를 보내지 않습니다. 분석 이벤트와 개인정보 경계는 [`docs/analytics.md`](docs/analytics.md)에 기록되어 있습니다.

## 운영 관측

합성 모니터링 → 개인정보를 제한한 PostHog `client_error` 이벤트 → 서버 JSON 오류 로그의 세 단계로 구성했습니다. `npm run monitor:synthetic`은 운영을 읽기 전용으로 검사합니다. 예약 검사 실패 시 GitHub 이슈를 생성·갱신하고 복구 시 닫습니다. 별도 주간 발행 검사는 `SYNTHETIC_PUBLISH_OPT_IN`이 있어야 실행되며 성공할 때마다 반환되지 않는 발행 쿼터 1건을 사용합니다.

브라우저 보고에는 기존 운영 호스트·개인정보 설정이 적용됩니다. 서버 5xx 로그에는 고정 라우트 분류와 생성한 요청 ID만 담고 원문 예외나 초대장 내용을 넣지 않습니다. 서버 로그는 호스팅 로그에 남으며 외부 보관·알림 규칙은 자동 설정하지 않습니다. 명령·수집 범위·검증의 한계는 [운영 관측 문서](docs/observability.md)를 참고하세요.

## 검색 노출(SEO)

랜딩 페이지만 검색에 노출되도록 설계되어 있습니다. `robots.txt`는 `/`를 허용하고 `/i/`, `/api/`를 차단하며, `sitemap.xml`은 랜딩 페이지 하나만 나열합니다. 발행된 개별 초대장(`/i/{id}`)은 `shared.html`의 메타 태그와 API의 `x-robots-tag` 헤더를 통해 항상 `noindex`로 유지됩니다 — 이름, 날짜, 장소, 전화번호처럼 초대한 사람들에게만 공유하려던 정보가 검색엔진에 노출되지 않게 하기 위한 의도적 결정입니다. 이 결정이 실수로 되돌려지지 않도록 테스트가 `noindex` 태그의 존재를 강제합니다. 랜딩 페이지에는 Google Search Console과 네이버 서치어드바이저 소유 확인 태그가 포함되어 있고, 사이트맵은 Google에 제출되었습니다. 자세한 근거와 배포 시 `robots.txt`/`sitemap.xml`을 함께 복사하는 빌드 단계는 [SEO 문서](docs/seo.md)를 참고하세요.

## 테스트와 빌드

```bash
npm test
npm run build:public
git diff --check
```

실제 MongoDB 저장소 검증:

```bash
npm run verify:publishing-mongo
```

`build:public`은 루트의 공개 HTML과 `assets/`, 그리고 `robots.txt`/`sitemap.xml`을 `public/`으로 복사합니다. 관리자 코드는 이 산출물에 들어가지 않습니다.

모바일 편집기 회귀 검증은 로컬 서버와 Chrome을 준비한 뒤 `PLAYWRIGHT_MODULE=/설치된/playwright/절대경로 node scripts/verify-mobile-editor.cjs`로 실행합니다. 한국어·영어, 320–1440px의 여섯 화면 폭에서 카드·버튼·입력의 실제 경계를 검사하여 상위 요소에 가려진 잘림도 탐지합니다. Playwright는 외부 QA 도구로 사용하며 서비스 의존성에는 추가하지 않습니다.

`.github/workflows/ci.yml`이 `main` 브랜치로의 push와 모든 PR마다 실행됩니다: `verify` 잡은 Node 22에서 `npm test`와 `npm run build:public`을 실행하고 빌드가 추적 파일을 건드리지 않았는지 확인하며, `publishing-mongo` 잡은 실제 `mongo:7` 서비스 컨테이너에 대해 `npm run verify:publishing-mongo`를 실행합니다. 이전에는 CI가 전혀 없었습니다.

## 문서 안내

- [`docs/architecture/README.md`](docs/architecture/README.md): 현재 구조, Graphify 분석, 리팩토링 진척 현황
- [`docs/publishing.md`](docs/publishing.md): 공개 발행 API와 MongoDB 운영
- [`docs/i18n.md`](docs/i18n.md): 사전 구조, 언어 결정 순서, 저작 콘텐츠와 chrome 번역 규칙
- [`docs/seo.md`](docs/seo.md): 검색 노출, 발행 초대장의 `noindex`, Search Console/서치어드바이저 확인
- [`docs/analytics.md`](docs/analytics.md): GA4/PostHog 설정과 이벤트 경계
- [`docs/observability.md`](docs/observability.md): 합성 검사, 브라우저 오류, 서버 로그와 검증 범위
- [`docs/mobile-app-plan.md`](docs/mobile-app-plan.md): 앱 방식 검토, 코드 재사용 범위, 단계별 구현·출시 기준
- [`DESIGN.md`](DESIGN.md): 제작기 UI와 템플릿 기준

## 유지보수 원칙

- 초대장 정규화와 렌더링 규칙은 `assets/invitation/core.js`를 기준으로 유지합니다.
- 공개 API와 관리자 API를 하나의 인증 흐름으로 합치지 않습니다.
- 저장소 문서를 HTTP 응답으로 직접 노출하지 않고 DTO 경계를 둡니다.
- 새 샘플 파일은 제작기 루트에 두지 않고 `docs/` 또는 별도 fixture 경로에 둡니다.
- 구조 변경은 공개 발행, 관리자, 정적 빌드 테스트를 함께 실행한 뒤 반영합니다.
