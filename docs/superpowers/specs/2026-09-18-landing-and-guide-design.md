# 랜딩 페이지와 사용 설명서 — 설계

| 항목 | 내용 |
| --- | --- |
| 작성일 | 2026-09-18 |
| 기준 커밋 | `ce7b65d` (main) |
| 상태 | 승인됨. 섹션 1~3은 대화에서 승인, 섹션 4는 이 문서로 확정 |
| 관련 | `DESIGN.md`, `docs/seo.md`, `docs/ui-ux-global-audit/2026-09-18/README.md` (B-11 온보딩 없음, A-8 데이터 안내 없음) |

## 목표

처음 온 사람을 첫 초대장까지 데려간다. 검색·공유 링크·지인 소개로 들어온 낯선 방문자가 30초 안에 "무엇을, 얼마나 쉽게, 어떤 조건으로" 를 납득하고 스튜디오로 넘어가게 하는 전환형 랜딩과, 만들기 전에 미리 읽거나 만들다 막혔을 때 찾아보는 고정 주소의 사용 설명서를 만든다.

이번 범위가 아닌 것: 회원가입, 동의 배너, 정식 개인정보처리방침·약관, 행사별 스튜디오 진입 쿼리, 스튜디오 내부 UX 변경, 다크 모드.

## 1. 페이지 구조와 입구 동작

### 파일과 주소

| 파일 | 주소 | 역할 |
| --- | --- | --- |
| `index.html` (새로 작성) | `/`, `/welcome` | 랜딩 |
| `guide.html` (새로 작성) | `/guide` | 사용 설명서 |
| `studio.html` (지금 `index.html`의 이름만 변경) | `/studio` | 스튜디오. 내용 변경은 아래 "스튜디오에 추가되는 것" 뿐 |
| `sample.html` (빌드 산출물, 체크인) | `/sample` | 완성 초대장 실물. 스튜디오 내보내기와 동일한 독립 문서 |

라우팅은 두 곳에 같은 매핑을 둔다. 로컬과 프로덕션이 같은 주소로 동작해야 한다.

- `vercel.json` `routes`: `/studio` → `/studio.html`, `/welcome` → `/index.html`, `/guide` → `/guide.html`, `/sample` → `/sample.html`. `handle: filesystem` 앞에 둔다.
- `server/http/static.cjs` `staticFileFor`: 같은 네 매핑을 `/` → `/index.html` 옆에 추가한다.

`python3 -m http.server` 로 여는 순수 정적 서빙에서는 `/studio.html`, `/guide.html` 처럼 확장자 있는 주소로 연다. 페이지 안의 링크는 모두 확장자 없는 정식 주소(`/studio`, `/guide`)를 쓴다. 정적 서빙은 미리보기 용도이고, 검증은 `npm start` 로 한다.

### `/` 의 분기

- 스튜디오는 `init()` 시작 시 `localStorage` 에 `invitation-studio:visited` 키로 ISO 날짜 문자열을 남긴다. 초안 데이터와 무관하며 "이 브라우저는 스튜디오를 써봤다" 는 뜻으로만 쓴다. 쓰기 실패는 무시한다.
- 랜딩 `<head>` 의 첫 스크립트는 인라인이며 스타일시트보다 앞에 온다. 조건이 모두 맞으면 `location.replace("/studio" + location.search)` 로 넘긴다.
  - 조건: `location.pathname` 이 `/` 또는 `/index.html`, `location.search` 에 `welcome` 파라미터가 없음, `localStorage.getItem("invitation-studio:visited")` 가 truthy.
  - 전체를 `try/catch` 로 감싼다. 시크릿 모드나 저장소 차단이면 랜딩을 그대로 보여준다.
  - `?lang=` 등 쿼리는 그대로 전달한다.
- `/welcome` 으로 열면 조건 1이 거짓이라 넘기지 않는다. 스튜디오 푸터의 "소개" 링크는 `/welcome` 을 가리킨다.
- 크롤러는 저장소가 없어 항상 랜딩을 본다.

### 기존 링크

에러 페이지 11개와 `shared.html` 의 `href="/"` 는 손대지 않는다. 상태 분기 덕분에 `/` 는 처음 온 사람에겐 랜딩, 써본 사람에겐 스튜디오이므로 "스튜디오로 돌아가기" 문구도 써본 사람에겐 여전히 참이다. 스튜디오 상단 바의 자기 로고 링크(`href="./"`)만 `/studio` 로 바꾼다.

### 메타와 검색

- 검색 콘솔 인증 태그 2개, OG·Twitter 태그, `canonical` `/`, `WebApplication` 구조화 데이터는 새 `index.html` 로 옮긴다. `scripts/synthetic/checks.cjs` 는 `/` 의 태그를 검사하므로 그대로 통과한다.
- `studio.html` 은 `canonical` 을 `/studio` 로 바꾸고 인증 태그를 뺀다. OG 태그는 남긴다.
- `guide.html` 은 자체 `<title>`, `description`, `canonical /guide`, OG 태그를 가진다. 이미지는 기존 소셜 카드를 재사용한다.
- `sample.html` 은 `<meta name="robots" content="noindex">` 를 가진다. 빌드 스크립트가 주입한다.
- `sitemap.xml` 에 `/guide`, `/studio` 를 추가한다. `/sample` 은 넣지 않는다.
- `robots.txt` 는 바꾸지 않는다.

### 스튜디오에 추가되는 것

- 상단 바 `.studio-bar-meta` 안, 언어 셀렉터 앞에 "사용법" 링크(`/guide`).
- 푸터에 "소개"(`/welcome`) · "사용법"(`/guide`) 링크.
- 완성 단계 `.finish-persistence-note` 아래에 "세 가지 방식의 차이 보기" 링크(`/guide#finish`) 하나.
- `app.js` 의 `init()` 첫 줄에 방문 표시 저장.

## 2. 랜딩 구성

스크롤 한두 번 분량. 모든 섹션이 `/studio` 로 가는 버튼 하나로 수렴한다.

1. **헤더** (설명서와 동일 마크업). 봉투 마크 + "Invitation Studio" 워드마크(`/welcome`), 오른쪽에 "사용법" 링크, 언어 셀렉터, 강조 버튼 "초대장 만들기". 스튜디오 상단 바와 같은 높이·색.
2. **히어로**. 눈썹 "회원가입 없음 · 무료", 제목 "작은 초대, 소중한 순간.", 부제 "디자인을 고르고, 내용을 채우고, 파일이나 링크로 보내세요." 주 버튼 "초대장 만들기"(`/studio`), 텍스트 링크 "완성된 초대장 먼저 보기"(`/sample`, 새 탭). 오른쪽(모바일은 아래)에 폰 프레임 안의 샘플 이미지. 소요 시간 숫자는 쓰지 않는다(측정된 적 없음).
3. **세 단계**. "01 디자인 고르기 · 02 내용 채우기 · 03 보관 / 파일 / 링크", 각 한 줄. 라벨은 스튜디오 내비게이션과 대응한다.
4. **디자인 갤러리**. 정적 이미지 6장, 모바일 2열·데스크톱 3열. 카드 아래 행사명. 카드는 링크가 아니다. 그리드 아래 버튼 "디자인 전체 보기"(`/studio`).
   - 대상: `bloom-portrait`(생일), `wedding`(결혼), `first-chapter`(돌잔치), `golden-years`(환갑), `botanical`(데이트), `midnight-cinema`(행사).
5. **안심 세 가지**. "회원가입도 앱 설치도 없습니다", "초안은 내 브라우저에만 남습니다", "파일로 받으면 영원히 내 것, 링크는 만료되고 내가 지울 수 있습니다". 아래에 "내 데이터는 어디에 저장되나요" 링크(`/guide#data`).
6. **마지막 버튼 + 푸터** (설명서와 동일 마크업). "초대장 만들기" 한 번 더. 푸터: INVITATION STUDIO · 소개 · 사용법 · 내 데이터(`/guide#data`).

### 시각 원칙

- 팔레트는 에러 페이지·소셜 카드와 동일: 종이 `#f7f7f4`, 잉크 `#282b29`, 녹색 `#314e41`, 보조 `#59645e`, 선 `#dce1d8`. 초대장 팔레트는 페이지 크롬에 오지 않는다.
- 외부 글꼴 없음. 시스템 글꼴 스택만. 초대장 타이포는 이미지 안에 있다.
- 이미지는 2배 해상도 PNG, `width`/`height` 명시. 히어로만 즉시, 갤러리는 `loading="lazy"`.
- 애니메이션 없음. `prefers-reduced-motion` 은 `scroll-behavior` 만 다룬다.
- 320/390/768/1440 확인. 모바일 단일 열, 버튼 전체 폭, safe-area 패딩, 페이지 가로 스크롤 없음.
- 포커스 링, 44px 터치 타깃, 스킵 링크, 랜드마크는 에러 페이지 기준을 따른다.

### 측정

스튜디오와 같은 `analytics/config.js`, `analytics.js`, `ga4.js` 를 싣는다. 페이지 조회는 기존 동작대로, "초대장 만들기" 버튼 클릭은 `landing_cta_clicked` 이벤트(`{ placement: "header" | "hero" | "gallery" | "footer" }`)로 남긴다. `sample` 링크 클릭은 `landing_sample_opened`. 동의 배너는 범위 밖이며 DNT/GPC 존중은 기존과 같다.

## 3. 설명서 구성

독자는 둘이다. 만들기 전에 훑어보는 사람과, 만들다 막혀서 답 하나를 찾는 사람. 위는 순서대로 읽히는 3단계, 아래는 제목만 보고 찾는 FAQ. 모든 소제목에 고정 앵커.

1. **헤더** (랜딩과 동일).
2. **제목과 한 줄**. "사용법" / "디자인을 고르고, 내용을 채우고, 원하는 방식으로 전하면 됩니다." 아래 페이지 안 목차 4개: `#steps`, `#finish`, `#data`, `#faq`.
3. **세 단계** `#steps`. 소제목은 스튜디오 내비게이션 이름. 단계마다 스튜디오 캡처 1장 + 3~4문장.
   - 01 디자인: 행사 유형 → 디자인 카드 → 샘플 확인 → "이 디자인으로 만들기". 고른 뒤 바꿔도 쓴 내용은 남는다.
   - 02 내용 편집: 기본 정보(제목·일정·메시지) 먼저, 장소, 사진과 효과는 접힌 항목. 미리보기는 하객이 받는 문서 그대로.
   - 03 완성: 세 방식 중 선택. 초안은 자동 저장.
4. **완성 방식 세 가지** `#finish`. 표 하나.

   | 방식 | 남는 곳 | 브라우저를 바꾸면 | 되돌리기 |
   | --- | --- | --- | --- |
   | 보관함에 저장 | 이 브라우저 | 사라짐 | 목록에서 삭제 |
   | 파일로 저장 | 내 기기의 HTML 파일 | 파일은 그대로 | 파일 삭제 |
   | 링크로 공유 | 서버 | 링크는 살아 있고, 취소 권한은 이 브라우저에만 | 스튜디오에서 취소 |

   아래 "HTML 파일은 어떻게 쓰나요": 어떤 브라우저에서든 열림, 메신저·메일에 파일로 첨부 가능, 보관함에 다시 불러오기 가능.
5. **내 데이터는 어디에** `#data`. 정직한 설명, 약관 아님.
   - 초안과 보관함은 이 브라우저 저장소에만. 서버로 보내지 않음.
   - 공개 링크만 서버에 저장. 마지막 열람 후 7일 지나면 만료, 발행 후 30일 지나면 무조건 만료. 만료 후 링크는 열리지 않음.
   - 링크 취소는 발행한 브라우저의 스튜디오에서만. 그 브라우저를 잃었으면 만료를 기다려야 함.
   - 공유 링크는 검색엔진에 색인되지 않음.
   - 방문 통계 도구 사용, 브라우저 추적 거부 설정 존중, 초대장 내용은 통계로 보내지 않음.
   - 하객이 자기 정보가 담긴 링크를 지우고 싶다면 보낸 사람에게 요청.
6. **자주 묻는 질문** `#faq`. `<details>` 8개.
   1. 사진은 몇 장까지? — 링크 공유는 전체 2MB(사진 서너 장), 파일 저장은 제한 없음.
   2. 사진이 안 올라가요 — 용량·형식, 다른 사진으로.
   3. 디자인을 바꾸면 쓴 내용이 사라지나요? — 아니요. 되돌리기도 있음.
   4. 지도 링크는 어떤 걸 넣나요? — 지도 앱에서 공유한 링크. (현재 지원 공급자는 코드 기준으로 기술)
   5. 초대장 언어와 화면 언어는 다른가요? — 화면 언어는 도구의 언어, 초대장 내용은 쓴 그대로.
   6. 여러 개 만들 수 있나요? — 보관함에 여러 개.
   7. 다른 기기에서 이어서 만들 수 있나요? — 파일로 저장해 옮긴 뒤 보관함에 불러오기.
   8. 만료된 링크를 다시 살릴 수 있나요? — 아니요. 새로 발행.
7. **마지막 버튼 + 푸터** (공유).

### 문체와 형식

- 짧고 행동 중심, 디자인 용어 대신 사용 상황. 단위만 적지 않고 체감을 함께("2MB, 사진 서너 장 정도").
- 스크린샷은 한국어 화면, `alt` 에 설명. 영어 캡처는 만들지 않는다. 설명은 옆 문장이 담당한다.
- 정책 숫자(7일, 30일, 2MB)는 서버·클라이언트 기본값이다. 테스트로 문장과 상수를 묶는다.

## 4. 파일, 사전, 빌드, 검증

### 새 파일

| 경로 | 내용 |
| --- | --- |
| `index.html` | 랜딩 |
| `guide.html` | 설명서 |
| `studio.html` | 기존 `index.html` 을 `git mv` |
| `sample.html` | 빌드 산출물 |
| `assets/site/site.css` | 랜딩·설명서 공용 스타일. 스튜디오 CSS와 독립 |
| `assets/site/site.js` | 언어 셀렉터 바인딩, CTA 이벤트 전송. 30줄 내외 |
| `assets/i18n/dictionary-site-ko.js`, `dictionary-site-en.js` | `site` 네임스페이스. 랜딩·설명서 카피 전부 |
| `assets/media/site/*.png` | 빌드 산출물: `hero-sample@2x.png`, `design-<id>@2x.png` 6장, `guide-step-0{1,2,3}@2x.png` |
| `scripts/build-site-media.cjs` | Playwright 로 위 이미지와 `sample.html` 생성 |
| `tests/site-pages.test.js` | 아래 검증 항목 |
| `docs/landing-and-guide.md` | 운영 문서: 왜 이런 구조인지, 재생성 방법, 바꾸면 안 되는 것 |

### 사전 분리

`InvitationI18n.register` 는 언어별 사전을 통째로 바꾼다. 그래서 `dictionary-site-*.js` 는 이미 등록된 `root.InvitationDictionaryKo` / `En` 위에 자기 `site` 네임스페이스를 얹은 새 객체를 다시 `register` 한다. 로드 순서는 `i18n.js` → `dictionary-ko.js` → `dictionary-en.js` → `dictionary-site-ko.js` → `dictionary-site-en.js` → `InvitationI18n.init()`. 랜딩·설명서는 언어 셀렉터의 `lang.*` 키와 `meta.*` 일부를 본 사전에서 쓰므로 본 사전도 싣는다. 스튜디오는 `site` 사전을 싣지 않는다.

`tests/i18n.test.js` 의 키 집합 비교는 `site` 사전에도 적용한다(ko·en 키 동일).

### 빌드 스크립트 `scripts/build-site-media.cjs`

- 기존 패턴을 따른다: `PLAYWRIGHT_MODULE` 환경 변수로 Playwright 를 찾고 `chromium.launch({ channel: "chrome" })`. npm 의존성 추가 없음. 산출물은 체크인한다.
- 입력: `INVITATION_BASE_URL`(기본 `http://localhost:4173`), 실행 중인 `npm start` 가 필요하다.
- 동작:
  1. `locale: "ko-KR"`, 390×844 뷰포트로 `/studio` 를 연다. 행사·템플릿 카드를 클릭하고 적용한다. `#preview` iframe 요소를 `deviceScaleFactor: 2` 로 스크린샷한다. 6개 디자인 반복.
  2. `bloom-portrait` 적용 상태에서 `document.querySelector("#preview").srcdoc` 를 읽어 `sample.html` 로 쓴다. `<head>` 바로 뒤에 `<meta name="robots" content="noindex">` 를 넣는다. 같은 화면을 히어로용으로도 스크린샷한다.
  3. 1440×900 으로 갤러리·편집·완성 단계를 각각 스크린샷해 `guide-step-*.png` 로 쓴다.
- `--check` 옵션: 산출물이 모두 존재하고 비어 있지 않은지만 확인한다. 픽셀 비교는 하지 않는다. 폰트·안티앨리어싱 차이로 매 실행이 달라지기 때문이다.
- `scripts/build-public.cjs` 는 이미 `[0-9A-Za-z_-]+\.html` 과 `assets/` 전체를 복사하므로 변경이 없다. 테스트로 `sample.html` 이 복사 대상 정규식에 매치되는지만 고정한다.

### 검증 `tests/site-pages.test.js`

- `index.html`, `guide.html` 의 `data-i18n` 인라인 한국어가 사전과 일치한다(기존 스튜디오 테스트와 같은 방식).
- 두 파일의 모든 `data-i18n`/`data-i18n-attr` 키가 ko·en 사전에 존재한다.
- `index.html` 에 인증 태그 2개, `canonical /`, `WebApplication` 구조화 데이터, 분기 스크립트(`invitation-studio:visited` 와 `/studio` 문자열, `welcome` 예외)가 있다.
- `studio.html` 에 인증 태그가 없고 `canonical /studio` 이다.
- `guide.html` 에 `#steps`, `#finish`, `#data`, `#faq` 앵커가 있다.
- 설명서의 `7`, `30`, `2MB` 문장이 `server/config/publishing.cjs` 기본값과 `publishing.js` 의 `MAX_PUBLISH_BYTES` 와 같다.
- 두 파일의 `<header class="site-header">…</header>` 와 `<footer class="site-footer">…</footer>` 마크업이 문자 단위로 같다.
- `vercel.json` 에 네 라우트가 `handle: filesystem` 앞에 있다. `staticFileFor` 가 `/studio`, `/welcome`, `/guide`, `/sample` 을 올바른 파일로 푼다.
- `sitemap.xml` 에 `/`, `/guide`, `/studio` 가 있고 `/sample` 은 없다.
- `sample.html` 이 존재하고 `noindex` 를 가진다.

기존 테스트: `index.html` 을 읽던 곳은 전부 `studio.html` 로 바꾼다. `tests/i18n.test.js` 의 "index.html serves the default language" 계열은 스튜디오 대상이므로 파일명만 바뀐다.

### 브라우저 검증

`npm start` 후 `scripts/verify-site-pages.cjs`(Playwright)로 다음을 확인하고 결과를 `docs/landing-and-guide.md` 에 적는다.

- 320/390/768/1440 에서 `/`, `/guide` 가로 스크롤 없음, CTA 가 첫 화면 안에 보임.
- 저장소 비운 상태에서 `/` 는 랜딩, `/studio` 방문 후 `/` 는 스튜디오로 이동, `/welcome` 은 랜딩 유지, `?lang=en` 이 리다이렉트 후에도 유지됨.
- `/sample` 이 열리고 `.invitation-card` 가 있음.
- 영어 전환 시 랜딩·설명서 전체가 번역됨(한국어 잔존 0).

### 커밋 단위

1. `studio.html` 이름 변경 + 라우팅 + 테스트 경로 치환 + 스튜디오 방문 표시. 여기서 전체 테스트가 통과해야 한다.
2. 공용 스타일 + `site` 사전 + 랜딩.
3. 설명서.
4. 빌드 스크립트 + 산출물.
5. 스튜디오 링크 3곳 + 사이트맵 + 운영 문서.

## 열린 질문

- 랜딩 전환율의 기준선이 없다. 배포 후 2주간 `landing_cta_clicked` / 랜딩 조회 비율을 보고 히어로 카피를 조정한다.
- 영어 방문자용 스크린샷은 요청이 생기면 그때 만든다.
