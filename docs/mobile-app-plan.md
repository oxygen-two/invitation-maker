# Invitation Studio 모바일 앱 확장 검토 및 구현 계획

**Goal:** 기존 Invitation Studio의 HTML/CSS/JavaScript 자산과 초대장 렌더링 계약을 유지하면서, 설치 가능한 웹 경험을 먼저 검증하고 필요할 때 iOS·Android 앱으로 안전하게 확장한다.

**Architecture:** 제작기와 초대장 도메인은 계속 웹 코드가 소유하고, 저장·파일 내보내기·공유·앱 생명주기만 얇은 플랫폼 어댑터 뒤로 둔다. 1차 출시는 PWA, 스토어 배포 가치가 확인되면 Capacitor 셸을 추가하며, React Native/Expo 전면 재작성은 별도 제품 조건이 충족될 때만 재검토한다.

**Tech Stack:** 기존 정적 HTML/CSS/JavaScript, IndexedDB, Node.js 22, MongoDB 공개 발행 API, PWA manifest/service worker, 선택적 Capacitor 및 공식 Filesystem/Share/App 플러그인

**Spec:** 현재 기준은 `README.ko.md`, `docs/architecture/README.md`, `docs/publishing.md`, `docs/superpowers/specs/2026-09-10-anonymous-publishing-design.md`이다.

## 전제와 결론

이 문서는 **현재 저장소의 Invitation Studio를 모바일 앱으로 확장한다**고 가정한다. 별도 신규 앱이나 관리자 앱을 만드는 계획은 아니다.

권장안은 `PWA 검증 → 플랫폼 어댑터 → Capacitor 기기 파일·공유 파일럿 → 스토어 출시 판단` 순서다. 다중 초안은 PWA 수요가 확인된 뒤 진행하는 독립 제품 마일스톤이며 최소 앱 파일럿을 막지 않는다. 현재 제품은 이미 모바일 웹에서 편집, 사진 압축 및 Base64/WebP 포함, IndexedDB 보관, 단일 HTML 다운로드, 익명 공개 링크 발행을 제공한다. Capacitor는 기존 웹 프로젝트에 추가할 수 있고 웹 산출물을 네이티브 프로젝트로 복사하는 흐름을 공식 지원하므로, 현재 자산 재사용과 유지보수 우선순위에 가장 잘 맞는다. [Capacitor 개요](https://capacitorjs.com/docs), [Capacitor 개발 흐름](https://capacitorjs.com/docs/basics/workflow)

PWA는 앱 설치 수요와 오프라인 제작 가치부터 가장 낮은 변경 비용으로 검증할 수 있다. manifest는 설치 메타데이터를 제공하고 service worker는 앱 셸을 오프라인에서 제공할 수 있다. 다만 iOS/iPadOS에는 브라우저 설치 프롬프트가 없고 사용자가 공유 메뉴에서 홈 화면에 직접 추가해야 하며, 설치본마다 저장소가 분리될 수 있다. [Web App Manifest](https://web.dev/learn/pwa/web-app-manifest), [PWA 설치](https://web.dev/learn/pwa/installation), [Service Worker](https://web.dev/learn/pwa/service-workers)

Capacitor는 `Filesystem`, `Share`, Android 뒤로 가기와 앱 생명주기 이벤트를 공식 플러그인으로 제공한다. HTML 파일을 기기 문서 영역에 쓰고 시스템 공유 시트로 전달하는 흐름을 만들 수 있다. iOS Files 앱 노출에는 별도 `Info.plist` 설정과 개인정보 매니페스트가 필요하다. [Filesystem](https://capacitorjs.com/docs/apis/filesystem), [Share](https://capacitorjs.com/docs/apis/share), [App](https://capacitorjs.com/docs/apis/app)

React Native/Expo는 지금 선택하지 않는다. React Native는 HTML DOM 대신 `View`, `Text`, `Image` 같은 네이티브 컴포넌트로 UI를 구성하므로 현재 편집기 DOM, CSS, `srcdoc` iframe 미리보기, standalone HTML 렌더러를 그대로 옮길 수 없다. Expo도 기기 파일과 공유 기능은 제공하지만, 전면 네이티브 UI를 선택하면 제작기 대부분을 다시 구현하고 두 렌더링 경로의 동등성을 장기 관리해야 한다. [React Native 기본 구조](https://reactnative.dev/docs/tutorial/), [React Native Core Components](https://reactnative.dev/docs/components-and-apis), [Expo FileSystem](https://docs.expo.dev/versions/latest/sdk/filesystem/), [Expo Sharing](https://docs.expo.dev/versions/latest/sdk/sharing/)

## 선택지 비교

| 선택지 | 기존 웹 UI·렌더러 재사용 | 기기 파일·공유 | 배포와 유지보수 | 현재 판단 |
| --- | --- | --- | --- | --- |
| PWA | 매우 높음 | 브라우저 지원 범위에 따름 | 가장 단순. 웹 배포 한 경로 | 첫 단계로 채택 |
| Capacitor 셸 | 매우 높음 | 공식 플러그인으로 파일 저장·공유·뒤로 가기 연결 가능 | Xcode/Android Studio, 서명, 스토어 심사 추가 | PWA 이후 파일럿 권장 |
| React Native/Expo | 도메인 JSON 일부만 재사용, UI는 대부분 재작성 | 네이티브 API 접근 우수 | 웹과 앱 UI·렌더링 계약을 함께 관리해야 함 | 현재 보류 |

단순 WebView 포장만으로 스토어 출시를 목표로 잡으면 안 된다. Apple은 앱이 재포장한 웹사이트를 넘어서는 기능, 콘텐츠와 UI를 요구한다. Capacitor 스토어 버전은 안정적인 기기 문서 보관, HTML 파일 공유, 앱 복귀 복원, 네이티브 뒤로 가기처럼 실제 앱 가치를 포함한 뒤 심사 후보로 삼는다. [Apple App Review Guideline 4.2](https://developer.apple.com/app-store/review/guidelines/)

## 구현 과정에서 유지할 목표 계약

- `assets/invitation/core.js`가 정규화와 standalone HTML 생성의 단일 기준이다. 웹 미리보기, 다운로드 파일, 로컬 보관함, 공개 뷰어 사이에 템플릿 HTML을 복제하지 않는다.
- 사진은 현재 압축과 Base64/WebP 포함 방식을 유지한다. 앱 셸이 사진 원본 경로나 별도 비공개 저장소를 공개 발행 API에 전송하지 않는다.
- 설치된 PWA 또는 앱에서는 로컬 초안과 HTML 파일 저장이 네트워크 없이 동작해야 한다. 현재 웹의 첫 로드는 네트워크가 필요하며, Phase 1 이후 이 목표를 검증한다. 공개 링크 생성·조회·취소만 네트워크 기능으로 둔다.
- MongoDB URI, 관리자 암호, 운영 자격 증명은 네이티브 번들·웹 자산·설정 파일에 넣지 않는다. 앱은 기존 공개 API만 호출한다.
- `admin/`은 앱 패키지와 공개 웹 산출물에 포함하지 않는다.
- 발행은 스냅샷이다. 로컬 편집이 기존 공개 링크를 자동 갱신하지 않으며, 관리 토큰은 해당 설치 저장소에만 남는다.

## 제안 구조

```text
InvitationCore / TemplateRenderers
              ↑
       Studio application
              ↓
      PlatformRuntime contract
       ├─ WebRuntime: IndexedDB, Blob download, Web Share 가능 시 사용
       └─ CapacitorRuntime: Filesystem, Share, App lifecycle/back button
              ↓
 Public API client: 운영 HTTPS origin의 /api/invitations
```

`PlatformRuntime`의 최소 계약은 `saveHtml({ name, html })`, `shareHtml({ name, html })`, `shareUrl({ title, url })`, `onBack(handler)`, `onPause(handler)`, `onResume(handler)`다. 웹 기본 구현을 항상 유지하고, Capacitor 구현은 런타임 감지 시에만 선택한다. 초대장 렌더러와 편집 상태는 이 어댑터를 알지 않는다.

Capacitor의 로컬 웹 origin은 운영 웹 origin과 같지 않으므로 현재 상대 경로 `API_ROOT = "/api/invitations"`를 그대로 두면 앱 발행 주소가 잘못된다. 공개 발행 클라이언트가 주입된 HTTPS API base를 받도록 바꾸고, 웹은 빈 base로 기존 same-origin 동작을 유지해야 한다. 운영 서버는 앱 origin을 정확히 허용하되 와일드카드 CORS나 HTTP 예외를 사용하지 않는다. Capacitor의 로컬 hostname/scheme과 외부 URL 처리 설정은 공식 구성 계약을 따른다. [Capacitor Configuration](https://capacitorjs.com/docs/config)

## 단계별 구현 계획

### Phase 0: 웹 기준선과 앱 성공 조건 고정

**Files:**

- Modify: `docs/mobile-app-plan.md`
- Verify: `tests/app-contract.test.js`, `tests/invitation-storage.test.js`, `tests/publishing-client.test.js`, `tests/invitation-core.test.js`

- [ ] 앱의 1차 사용자 흐름을 `새 초대장 → 사진 추가 → 자동 저장 → 앱 종료/복귀 → HTML 파일 저장 → 시스템 공유 → 공개 링크 생성`으로 고정한다.
- [ ] 320px, 390px, 768px에서 갤러리·편집·완성·보관함 흐름과 키보드 표시 상태를 기준 스크린샷으로 남긴다.
- [ ] 현재 `npm test`, `npm run build:public`, `git diff --check` 결과를 기준선으로 기록한다.
- [ ] iOS Safari 실제 기기에서 사진 선택, 키보드, HTML 다운로드 후 Files에서 다시 열기, KakaoTalk 링크 열기를 각각 관찰한다. 자동화 실패는 제품 결함으로 단정하지 않는다.

**Acceptance:** 기존 웹 기능이 모두 통과하고, 앱 파일럿이 해결해야 할 실제 기기 실패 목록이 재현 절차와 함께 남아 있다.

### Phase 1: PWA 설치 및 오프라인 제작

**Files:**

- Create: `manifest.webmanifest`
- Create: `service-worker.js`
- Create: `assets/icons/`의 설치 아이콘 세트
- Modify: `index.html`
- Modify: `scripts/build-public.cjs`
- Modify: `tests/app-contract.test.js`
- Create: `tests/pwa-contract.test.js`

- [ ] manifest에 앱 이름, 아이콘, `start_url`, `scope`, `display: standalone`, 테마 색을 명시하고 `index.html`에 연결한다.
- [ ] service worker는 제작기 앱 셸과 템플릿 자산만 precache하고 `/api/`, `/i/`, 분석 요청, 사용자 초대장 데이터를 캐시하지 않는다.
- [ ] 새 배포의 캐시 이름을 버전별로 바꾸고 활성화 시 이전 앱 셸 캐시만 제거한다.
- [ ] 오프라인에서 새 초대장 편집, IndexedDB 자동 저장, 미리보기, standalone HTML 생성까지 동작시킨다. 공개 링크 기능은 연결 필요 상태를 명시한다.
- [ ] `build:public`이 manifest, service worker, 아이콘을 포함하고 `admin/`을 포함하지 않는 계약 테스트를 추가한다.
- [ ] Android Chrome 설치, iOS 홈 화면 수동 추가, 각 설치의 저장소 독립성을 실제 기기에서 확인한다.

**Acceptance:** 첫 온라인 로드 이후 비행기 모드에서 편집·복원·HTML 생성이 가능하고, 공개 발행은 조용히 실패하지 않으며, Lighthouse 결과와 별도로 실제 Android/iOS 설치 흐름이 확인된다.

### Phase 2 (선택 제품 마일스톤): 다중 초안과 웹 뒤로 가기 계약 정리

이 단계는 반복 사용자가 여러 초대장을 관리하려는 수요가 확인되면 진행한다. 현재 단일 초안 모델로도 Phase 3~4의 최소 앱 파일럿을 실행할 수 있다.

**Files:**

- Modify: `assets/storage/invitation-storage.js`
- Modify: `assets/studio/app.js`
- Modify: `index.html`
- Modify: `tests/invitation-storage.test.js`
- Modify: `tests/app-contract.test.js`

- [ ] IndexedDB를 단일 `drafts/current`에서 `drafts/{documentId}`와 `settings/currentDocumentId` 구조로 마이그레이션한다. 기존 `current` 초안은 새 ID를 부여해 한 번만 이동한다.
- [ ] 문서 레코드를 `{ id, invitation, createdAt, updatedAt }`으로 정하고 새로 만들기, 열기, 이름 변경, 복제, 삭제 함수를 저장소 어댑터에 둔다.
- [ ] 보관함의 생성 HTML 레코드가 원본 `documentId`를 가질 수 있게 하되, 업로드 HTML은 viewer 전용으로 유지한다.
- [ ] 갤러리 → 편집 → 완성 → 보관함 상태를 `history.pushState`와 `popstate`에 연결하고, 편집 내용은 화면 이동 전에 저장한다.
- [ ] 저장 공간 제한 시 오래된 문서를 자동 삭제하지 않고 사용자가 선택할 수 있는 오류 상태를 보여준다.

**Acceptance:** 앱을 강제 종료했다가 열어도 마지막 문서와 화면이 복원되고, Android 시스템 뒤로 가기와 브라우저 Back이 같은 상태 순서를 따르며, 기존 단일 초안 데이터가 손실 없이 마이그레이션된다.

### Phase 3: 플랫폼 어댑터와 공개 API base 분리

**Files:**

- Create: `assets/platform/runtime.js`
- Create: `assets/platform/web-runtime.js`
- Modify: `assets/studio/app.js`
- Modify: `assets/publishing/publishing.js`
- Modify: `server/http.cjs`
- Modify: `server/config/http.cjs`
- Modify: `.env.example`
- Modify: `index.html`
- Create: `tests/platform-runtime.test.js`
- Modify: `tests/publishing-client.test.js`
- Modify: `tests/publishing-server.test.js`
- Modify: `tests/server-config.test.js`

- [ ] `PlatformRuntime` 계약과 브라우저 기본 구현을 추가하고 기존 Blob 다운로드를 `saveHtml`로 이동한다.
- [ ] Web Share가 HTML 파일 공유를 지원할 때만 `shareHtml`을 노출하고, 지원하지 않으면 다운로드 안내로 돌아간다.
- [ ] 공개 발행 클라이언트 생성자에 `apiBase`를 주입한다. 웹 기본값은 빈 문자열, 앱 설정은 고정된 운영 HTTPS origin으로 제한한다.
- [ ] 서버가 반환하는 상대 경로 `/i/{id}`는 클라이언트에서 `apiBase` 또는 현재 웹 origin을 기준으로 절대 HTTPS URL로 변환하고, 설정한 운영 origin과 일치하는지 검증한 뒤에만 복사·공유한다.
- [ ] 서버의 단일 `PUBLISH_ALLOWED_ORIGIN` 계약을 쉼표로 구분한 정확한 origin allowlist로 확장하고 공백, 중복, 잘못된 URL을 시작 시 거부한다. 운영 웹 origin과 실제 Capacitor iOS·Android origin만 등록하며 `*`는 허용하지 않는다.
- [ ] `Authorization`, `Content-Type`, `Idempotency-Key`가 포함된 앱의 교차 origin POST/DELETE를 위해 OPTIONS preflight와 `Access-Control-Allow-Origin`, 허용 메서드·헤더, `Vary: Origin` 응답을 구현한다. 허용하지 않은 origin의 preflight와 본 요청은 모두 거부한다.
- [ ] 관리 토큰, 사진 내용, 초대장 원문이 오류 로그나 분석 이벤트에 포함되지 않는 테스트를 유지한다.
- [ ] 브라우저 런타임 회귀 테스트로 기존 다운로드, URL 공유, 발행/취소를 검증한다.

**Acceptance:** 플랫폼 어댑터를 비활성화한 일반 웹에서 기존 행동이 동일하고, 테스트용 API base를 주입했을 때 모든 발행 요청이 그 origin으로만 향한다. 공유 결과는 운영 HTTPS origin의 절대 `/i/{id}` URL이다. 등록된 앱 origin의 preflight와 POST/DELETE만 성공하고 임의 origin 및 와일드카드 설정은 실패한다.

### Phase 4: Capacitor iOS·Android 파일럿

**Files:**

- Create: `capacitor.config.json`
- Create: `assets/platform/capacitor-runtime.js`
- Create: `scripts/build-mobile.cjs` (Phase 4 계획 산출물 — 저장소에 아직 없음)
- Create: `ios/`
- Create: `android/`
- Modify: `package.json`, `package-lock.json`
- Modify: `scripts/build-public.cjs`
- Modify: `.gitignore`
- Create: `tests/capacitor-contract.test.js`

- [ ] 실행 시점에 고정한 동일 major의 Capacitor core/CLI/iOS/Android와 공식 `filesystem`, `share`, `app` 플러그인만 추가한다.
- [ ] (계획) `scripts/build-mobile.cjs`가 `index.html`, `viewer.html`, `invitation-data.json`과 두 화면이 참조하는 `assets/`만 `mobile/www/`에 복사하게 하고, Capacitor `webDir`을 이 산출물로 지정한다. 앱 빌드 명령은 `build:mobile` 후 `npx cap sync`를 실행한다. 이 스크립트는 Phase 4 파일럿에서 새로 만들 산출물이며, 현재 `scripts/`에는 존재하지 않는다.
- [ ] 앱 번들 allowlist 테스트가 `admin/`, `server/`, `api/`, `scripts/`, `tests/`, `.env*`, 문서, 공개 수신자용 `shared.html`, 루트 오류 페이지를 거부한다.
- [ ] `CapacitorRuntime.saveHtml`은 UTF-8 HTML을 앱 Documents 영역에 영구 저장한다. Android Share는 기본적으로 cache 폴더 파일만 허용하므로 공유할 때 세션별 임시 cache 복사본을 만든다. 공유 시트가 닫힌 직후에는 수신 앱이 파일을 비동기로 읽을 수 있어 삭제하지 않고, 다음 정상 기동에서 이전 세션 폴더만 정리한다. 실제 KakaoTalk·메일·Files 공유에서 지연 읽기를 검증하며 `file_paths.xml` 범위를 Documents 전체로 넓히지 않는다.
- [ ] URL 공유는 공개 링크만 전달하고 관리 토큰을 공유 payload에 넣지 않는다.
- [ ] Android `backButton`을 Phase 2의 history 상태에 연결한다. Phase 2를 건너뛴 파일럿은 `갤러리 → 편집 → 완성 → 보관함`의 현재 화면 상태만 최소 history stack으로 만들며 다중 초안까지 끌어오지 않는다. 최상위 상태에서만 앱 종료 기본 동작을 허용한다.
- [ ] 입력 변경을 debounce해 전경 상태에서 IndexedDB에 지속적으로 저장한다. pause 이벤트에서는 남은 쓰기를 best-effort로 요청하고, 앱 종료 시 완료를 보장한다고 가정하지 않는다. resume 시 마지막으로 완료된 초안과 외부 파일 선택 결과를 복원한다.
- [ ] iOS Files 앱 노출 여부를 제품 요구에 맞게 설정하고, Filesystem 플러그인이 요구하는 `PrivacyInfo.xcprivacy` 사유를 포함한다.
- [ ] 앱 패키지에 `admin/`, `.env*`, MongoDB URI, 관리자 코드, 개발 로그 설정이 없음을 검사한다.

**Acceptance:** iOS와 Android 실제 기기에서 사진 선택, 편집, 종료/복귀, HTML을 Files에 저장, KakaoTalk을 포함한 시스템 공유 시트 호출, 공개 링크 발행·취소가 통과한다. 네트워크가 없을 때 로컬 편집과 파일 저장은 유지되고 공개 발행만 명확히 보류된다.

### Phase 5: 스토어 출시 판단과 배포 자동화

**Files:**

- Create: `docs/mobile-release.md`
- Modify: `.github/workflows/ci.yml`
- Modify: 플랫폼별 앱 메타데이터와 개인정보 매니페스트

- [ ] App Store 최소 기능 기준에 맞춰 PWA 대비 앱 고유 가치를 실제 기능 목록과 스크린샷으로 증명한다.
- [ ] 개인정보 표시에 초대장 본문·사진의 로컬 처리와 공개 발행 시 서버 전송 경계를 정확히 적는다.
- [ ] CI가 웹 테스트·공개 빌드 후 Capacitor sync 결과의 변경 여부를 검사하고, 서명 비밀은 저장소 밖의 배포 환경에서만 주입한다.
- [ ] TestFlight와 Android 내부 테스트에서 신규 설치, 업그레이드, 오프라인, 저용량 저장소, 대용량 사진, 발행 한도 오류를 검증한다.
- [ ] 스토어 제출은 Phase 4 실제 기기 수용 기준과 개인정보 문서가 모두 통과한 경우에만 진행한다.

**Acceptance:** 서명되지 않은 재현 가능한 빌드가 CI에서 생성되고, 내부 배포에서 치명 오류와 데이터 손실이 없으며, 심사 메모가 앱 고유 기능과 테스트 계정 불필요 사유를 설명한다.

## iOS·KakaoTalk 검증 경계

Capacitor는 **제작자 앱 내부**의 WKWebView와 파일·공유 기능을 개선할 수 있다. 그러나 수신자가 KakaoTalk 안에서 공개 링크를 열면 KakaoTalk의 인앱 브라우저가 운영 `shared.html`을 렌더링한다. 앱 셸은 그 브라우저를 교체하거나 수정하지 않으므로, Capacitor 포장이 수신자 측 iOS KakaoTalk 문제를 해결한다고 보장할 수 없다.

따라서 다음 두 검증을 분리한다.

- 제작자 앱: iOS Capacitor 앱에서 편집, 파일 저장, 공유 시트로 KakaoTalk 선택까지 검증한다.
- 수신자 링크: 별도 iPhone의 KakaoTalk 인앱 브라우저에서 공개 링크의 레이아웃, 폰트, 지도 링크, 스크롤, 외부 브라우저 열기를 검증한다.

수신자 WebView 결함은 `shared.html`과 standalone renderer의 웹 호환성 문제로 수정하고, Capacitor 플러그인 우회책으로 처리하지 않는다.

## React Native/Expo 재검토 조건

다음 조건 중 둘 이상이 실제 사용자 요구로 확인될 때 별도 기술 결정 기록을 작성한다.

- 네이티브 화면 전환과 접근성이 웹 편집기 개선으로 충족되지 않는다.
- 카메라, 알림, 백그라운드 업로드, 공유 확장 같은 네이티브 기능이 핵심 반복 사용 흐름이 된다.
- 대규모 사진 편집에서 WebView 메모리나 성능 문제가 실제 기기 프로파일링으로 반복 확인된다.
- 웹과 앱 제품이 서로 다른 UI와 출시 주기를 가져야 한다.

그때도 `InvitationCore`의 JSON 정규화와 standalone HTML 생성은 공유 가능한 독립 패키지로 먼저 추출하고, React Native 화면이 초대장 HTML을 별도로 재구현하지 않게 한다.

## 중단 기준

- PWA 설치 후 재방문과 오프라인 제작 사용이 확인되지 않으면 스토어 셸 작업을 시작하지 않는다.
- Capacitor 파일럿이 기존 standalone HTML 결과, 로컬 데이터 복원, 공개 발행 보안을 보존하지 못하면 파일럿에서 중단하고 웹을 유지한다.
- App Store 고유 가치가 파일 저장·공유·복원만으로 충분하지 않다고 판단되면 심사를 서두르지 않고 PWA를 정식 모바일 채널로 유지한다.
- React Native/Expo 전환은 위 재검토 조건과 별도 승인된 마이그레이션 계획이 없으면 시작하지 않는다.
