# 랜딩 페이지와 사용 설명서

이 문서는 [`docs/superpowers/specs/2026-09-18-landing-and-guide-design.md`](superpowers/specs/2026-09-18-landing-and-guide-design.md)의 설계를 실제로 어떻게 구현했는지, 무엇을 바꾸면 안 되는지, 어떻게 다시 만들고 검증하는지를 다룬다. 설계 자체의 근거(왜 이 섹션 순서인지, 왜 이 카피인지)는 그 문서에 있다. 여기는 운영 관점 — 이 구조를 왜 택했는지, 파일이 어디 있는지, 재생성과 검증 명령이 무엇인지 — 를 다룬다.

## 1. 왜 이 구조인가

**`/` 상태 분기.** 랜딩의 목적은 처음 온 사람을 스튜디오까지 데려가는 것이지만, 이미 스튜디오를 써본 사람에게 매번 랜딩부터 다시 보여주는 것은 재방문자에게 불필요한 클릭 하나를 강제하는 비용이다. 그래서 `/`는 상태를 본다: 스튜디오가 `init()` 시작 시 남기는 `invitation-studio:visited` 플래그가 있으면 `location.replace("/studio" + location.search)`로 즉시 넘기고, 없으면 랜딩을 그대로 보여준다. 이 분기는 스타일시트보다 앞선 인라인 스크립트라서, 넘어갈 사람은 랜딩이 한 프레임도 그려지기 전에 넘어간다. 첫 방문자에게는 온보딩(랜딩)을, 재방문자에게는 최단 경로(스튜디오)를 동시에 만족시키는 방법이 상태 분기 말고는 없었다 — 두 그룹을 같은 주소에서 나누려면 서버 쪽 정보(로그인, 세션) 없이는 클라이언트 저장소를 볼 수밖에 없다.

**`/welcome`이 있는 이유.** 상태 분기는 재방문자에게는 옳지만, "랜딩을 다시 보고 싶다"는 의도적인 요청까지 막아서는 안 된다. 스튜디오 푸터의 "소개" 링크가 가리키는 곳이자, 상태 분기 조건 중 `location.pathname`이 `/`가 아니므로 절대 스튜디오로 튕기지 않는 고정 주소가 `/welcome`이다. 크롤러는 저장소가 없어 `/`에서도 항상 랜딩을 보므로 별도 배려가 필요 없지만, 사람이 "그 페이지 다시 보기"를 누를 수 있는 경로는 상태와 무관한 주소가 하나 있어야 했다.

**파일명 변경(`index.html` → `studio.html`).** 기존 에디터가 `index.html`이었던 자리에 랜딩이 들어와야 하므로, 에디터는 다른 파일명이 필요했다. 여기서 두 가지 서빙 방식(`npm start`의 정적 서버, Vercel 배포)이 정확히 같은 주소 매핑을 갖도록 라우팅을 두 곳에 중복 정의했다 — `vercel.json`의 `routes`와 `server/http/static.cjs`의 `staticFileFor`. 파일명이 바뀌어도 URL은 바뀌지 않는 것(에디터는 항상 `/studio`)이 핵심이었고, 그러려면 로컬과 프로덕션 각각의 라우팅 계층에서 같은 매핑을 두 번 선언하는 수밖에 없었다 — 하나가 파일시스템 라우팅을 우선하는 Vercel이고 하나가 직접 매핑하는 Node 서버이기 때문이다.

## 2. 파일과 주소

| 파일 | 주소 | 역할 |
| --- | --- | --- |
| `index.html` | `/`, `/welcome` | 랜딩 (상태 분기는 `/`에서만) |
| `guide.html` | `/guide` | 사용 설명서 |
| `studio.html` | `/studio` | 스튜디오. 이번 작업에서 추가된 것은 "사용법"/"소개" 링크와 완성 단계의 비교 링크뿐 |
| `sample.html` | `/sample` | 완성 초대장 실물 — 빌드 산출물, `noindex` |
| `assets/site/site.css` | — | 랜딩·설명서 공용 스타일. `assets/studio/studio.css`와 독립 |
| `assets/i18n/dictionary-site-ko.js`, `dictionary-site-en.js` | — | `site` 네임스페이스. 랜딩·설명서 카피 전부 |
| `assets/media/site/design-<id>-2x.jpg` (6장) | — | 갤러리·히어로용 디자인 캡처. 별도 히어로 파일은 없음 — 히어로는 `design-bloom-portrait-2x.jpg`를 그대로 재사용 |
| `assets/media/site/guide-step-0{1,2,3}-2x.jpg` | — | 설명서 세 단계(디자인·편집·완성) 캡처 |

## 3. 바꾸면 안 되는 것

- 검색 콘솔 인증 태그(`google-site-verification`, `naver-site-verification`)는 `index.html`에만 있다. `studio.html`로 옮기거나 복사하면 안 된다 — 이 두 태그가 확인하는 것은 도메인 소유권이지 특정 페이지의 인기가 아니고, 스튜디오는 검색 노출 대상이 아니었던 적이 없다(canonical만 `/studio`로 바뀐다).
- 에러 페이지 11개와 `shared.html`의 `href="/"`는 그대로 둔다. 상태 분기 덕분에 `/`는 처음 온 사람에겐 랜딩, 써본 사람에겐 스튜디오이므로 "스튜디오로 돌아가기" 같은 기존 문구는 여전히 참이다.
- 정책 숫자(보관 만료 7일, 발행 후 최대 30일, 링크 공유 용량 2MB)는 `server/config/publishing.cjs`와 `assets/publishing/publishing.js`의 실제 상수와 테스트로 묶여 있다(`tests/site-pages.test.js`의 "guide policy numbers match the shipped defaults"). 설명서 문장만 고쳐서 숫자가 실제 동작과 어긋나는 일이 생기지 않도록, 숫자를 바꿀 때는 반드시 코드 쪽 상수부터 바꾸고 테스트가 새 숫자를 확인하게 한다.
- `sample.html`은 생성물이다. 직접 편집하지 않는다 — 다음 `build-site-media.cjs` 실행이 덮어쓴다. 내용을 바꾸려면 스튜디오의 `bloom-portrait` 디자인 자체를 바꾼다.

## 4. 재생성

이미지와 `sample.html`은 실제 스튜디오를 Playwright로 구동해 만든다. 스튜디오가 만드는 것과 다른 무언가를 손으로 그려 넣는 대신, 실물을 그대로 찍기 위해서다.

```bash
npm start   # 다른 터미널에서, 서버가 이미 떠 있다면 생략

PLAYWRIGHT_MODULE=/절대/경로/playwright \
INVITATION_BASE_URL=http://127.0.0.1:4173 \
node scripts/build-site-media.cjs

node scripts/build-site-media.cjs --check   # 산출물 존재·용량만 확인, 픽셀 비교는 하지 않음
```

`PLAYWRIGHT_MODULE`은 이 저장소가 Playwright를 npm 의존성으로 갖지 않기 때문에 필요하다 — 로컬에 설치된 Playwright 모듈의 절대 경로를 가리킨다. `--check`가 픽셀 단위 비교를 하지 않는 이유는 폰트 렌더링과 안티앨리어싱이 실행마다 미세하게 달라 완전히 결정적인 이미지를 기대할 수 없기 때문이다.

측정된 실제 이미지 크기(이번 재생성 기준):

| 파일 | 픽셀 크기 | 비고 |
| --- | --- | --- |
| `design-<id>-2x.jpg` (6장 공통) | 668×1374 | `#preview` iframe을 `deviceScaleFactor: 2`로 캡처 |
| `guide-step-0{1,2,3}-2x.jpg` | 2880×1800 | 1440×900 데스크톱 뷰포트를 2배로 캡처 |

파일명 접미사는 `-2x`이고 `@` 문자는 쓰지 않는다 — `server/http/static.cjs`의 정적 파일 허용 정규식이 `[0-9A-Za-z_./-]`만 통과시켜 `@`가 들어간 경로는 404가 나기 때문이다(라우팅 정규식을 완화하는 대신 파일명을 URL 안전한 문자로 맞췄다). 새 이미지를 추가할 때도 이 규칙을 따른다. 히어로 전용 이미지 파일은 따로 없다 — 히어로가 보여주는 것은 갤러리 첫 카드와 같은 `bloom-portrait` 디자인이라 `design-bloom-portrait-2x.jpg`를 그대로 재사용한다.

`index.html`/`guide.html`의 `<img width height>`는 이 실측 픽셀 크기와 같아야 한다 — 다르면 레이아웃 시프트(CLS)가 생기고, `sips -g pixelWidth -g pixelHeight <파일>`로 언제든 재확인할 수 있다. 스튜디오 UI가 바뀌어 캡처 구도가 달라지면(예: 상단 바에 링크가 하나 늘어 높이가 바뀌는 경우) 반드시 재생성 후 이 크기를 다시 재고 HTML의 `width`/`height` 속성도 같이 맞춘다 — 이번 작업에서 스튜디오 상단 바에 "사용법" 링크를 추가한 뒤 `guide-step-*` 세 장을 다시 찍은 것이 그 예다. 데스크톱 캡처 세 장은 각각 찍기 직전에 `window.scrollTo(0, 0)`으로 맨 위로 되돌린다 — Playwright가 클릭한 요소를 자동으로 화면에 스크롤해 넣는 동작 때문에, 스크롤을 되돌리지 않으면 상단 바(와 "사용법" 링크)가 프레임 밖으로 밀려날 수 있다.

## 5. 검증

```bash
npm test                              # 전체 Node 테스트
node scripts/build-site-media.cjs --check
PLAYWRIGHT_MODULE=/절대/경로/playwright \
INVITATION_BASE_URL=http://127.0.0.1:4173 \
node scripts/verify-site-pages.cjs
```

`verify-site-pages.cjs`는 다음을 실제 브라우저(Chromium)로 확인한다: 320/390/768/1440 네 폭에서 `/`, `/guide`에 가로 스크롤이 없고 `.site-cta`가 첫 화면 안에 보이는지, 저장소를 비운 브라우저는 `/`에서 랜딩을 보고 `/studio` 방문 후에는 `/`(과 `?lang=` 유지)가 스튜디오로 넘어가지만 `/welcome`은 절대 넘어가지 않는지, `/sample`에 `.invitation-card`가 정확히 하나인지, 영어 전환 시 `/welcome`과 `/guide`에 한국어가 하나도 남지 않는지.

배포 이후에는 로컬 검증만으로 알 수 없는 것 — 실제 색인 여부 — 을 Search Console에서 확인한다: `/guide`를 URL 검사 도구에 넣어 색인 상태를 보고, 아직이면 색인 생성 요청을 보낸다. `sitemap.xml`은 이미 `/guide`, `/studio`를 포함하도록 갱신했으므로 별도 제출 없이도 다음 크롤링에서 발견되지만, 즉시 확인하고 싶다면 URL 검사가 더 빠르다.

## 6. 측정

랜딩과 설명서는 스튜디오와 같은 `analytics/config.js`, `analytics.js`, `ga4.js`를 그대로 싣는다. 이번에 새로 남는 이벤트는 세 가지다.

- `site_page_viewed { page: "landing" | "guide" }` — 페이지 조회.
- `landing_cta_clicked { placement: "header" | "hero" | "gallery" | "footer" }` — "초대장 만들기" 버튼 클릭 위치.
- `landing_sample_opened` — "완성된 초대장 먼저 보기" 링크 클릭(새 탭으로 `/sample`을 엶).

PostHog에서 보게 될 가장 중요한 비율은 `landing_cta_clicked` 합계를 `site_page_viewed{page:landing}`으로 나눈 값 — 즉 랜딩에서 스튜디오로 넘어간 비율이다. 배포 전에는 이 비율의 기준선이 없으므로(설계 문서의 열린 질문), 배포 후 2주간 이 값을 관찰하고 낮으면 히어로 카피나 버튼 위치를 조정하는 근거로 쓴다.

## 7. 이번에 하지 않은 것

- 동의 배너(쿠키/추적 동의 UI) — 기존처럼 DNT/GPC 존중만으로 대응하며, 배너 자체는 이번 범위 밖이다.
- 정식 개인정보처리방침·이용약관 — 설명서의 "내 데이터는 어디에" 섹션은 정직한 설명이지 법적 문서가 아니다.
- 행사별(생일/결혼 등) 스튜디오 진입 쿼리 — 랜딩에서 특정 행사로 바로 진입하는 딥링크는 만들지 않았다.
- 영어 방문자용 스크린샷 — 설명서와 랜딩의 이미지는 한국어 화면만 캡처한다. 영어 캡처는 요청이 생기면 별도 작업으로 만든다.
