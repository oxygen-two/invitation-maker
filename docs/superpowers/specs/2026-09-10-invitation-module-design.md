# Invitation module design

## 결정

제작기를 같은 저장소 안의 독립 모듈로 분리한다. 별도 저장소·마이크로서비스·npm 배포는 이번 범위가 아니다. 로그인, 소유권, 저장, 발행은 서비스 책임이며 제작기는 JSON 편집과 미리보기를 책임진다.

## Global Constraints

- 기존 no-build HTML/CSS/JS 구조와 의존성을 유지한다.
- 독립 실행 HTML 다운로드와 기존 JSON/로컬 보관함 호환성을 유지한다.
- 개인 생일 페이지와 사용자의 기존 미커밋 변경은 수정하지 않는다.
- 이번 구현 범위는 로컬 제작 모듈 분리이며 인증·클라우드·공개 발행은 후속 프로젝트다.
- 첫 버전은 문서당 제작기 한 개를 지원하되 해제 후 재마운트를 지원한다.
- 모바일 320/390/768px와 데스크톱 1440px에서 기존 제작 흐름을 유지한다.

## 현재 근거

`assets/invitation-core.js`의 normalizeInvitation/renderInvitationBody/buildStandaloneHtml은 재사용 기반이다. `assets/app.js`에는 폼, 템플릿 적용, 이미지/지도 비동기 작업, IndexedDB 초안 저장, 보관함, 다운로드가 함께 있다. `assets/invitation-storage.js`는 로컬 저장이며 `viewer.html?id=...`는 다른 사람에게 공유할 수 있는 공개 링크가 아니다.

## 책임 경계

| 구성 | 소유하는 책임 | 소유하지 않는 책임 |
| --- | --- | --- |
| 기존 core/renderers/catalog | 데이터 정규화, 템플릿 렌더링, 독립 HTML | 로그인, DOM 폼, 저장소 |
| invitation-editor | 폼, 템플릿 선택/적용, 사진 편집, 지도 미리보기, 변경 이벤트 | IndexedDB 접근, 계정, 공개 URL |
| local-draft-controller | 로컬 초안 쓰기 직렬화, 성공/실패 결과 | 폼, 인증, 보관함 마이그레이션 |
| app 서비스 조립부 | 제작/보관함/완료 화면 전환, 저장 상태, 다운로드, 보관함·마이그레이션 | 템플릿 본문 렌더링 재구현 |
| 후속 공개 페이지 서비스 | 발행 스냅샷, 접근 정책, 최초 HTML의 OG 메타데이터 | 편집기 로딩, 로컬 초안 공개 |

## 제작기 계약

`InvitationEditor.mount(root, {initialValue, onChange, onError})`는 동기적으로 핸들을 반환한다. root는 편집 폼·템플릿 갤러리·미리보기를 포함하는 DOM 영역이다. 외부 보관함과 서비스 내비게이션은 app이 관리한다.

- `getValue()` → 정규화된 JSON 복제본. 외부 수정이 내부 상태에 영향을 주지 않는다.
- `setValue(value)` → 데이터를 교체한다. 사용자 변경 이벤트를 발생시키지 않는다. 이미지 처리 등 편집 작업 중에는 `EDITOR_BUSY` 오류를 던진다.
- `isBusy()` → 편집 작업 중 여부. 저장소 네트워크 상태와 구분한다.
- `destroy()` → 이벤트/observer/timer/지도/임시 object URL을 정리한다. 완료가 늦은 비동기 작업은 세대 번호로 무시한다.
- `onChange({value, revision})` → 사용자 편집 및 템플릿 적용 후 호출한다. revision은 마운트 내 단조 증가 정수다.
- `onError({code, message})` → 이미지·지도 작업 실패를 알린다. 실패 시 마지막 유효 데이터를 보존한다.

내보내기는 app에서 busy 확인·기존 입력 검증·연락처 확인을 거쳐 `InvitationCore.buildStandaloneHtml(editor.getValue())`를 호출한다. 저장/다운로드를 모듈 API에 중복 구현하지 않는다. DOM 의존 검증은 editor 내부에 유지하되 app이 기존 버튼 흐름을 호출할 수 있는 `validateForExport(): boolean`, `confirmReplyContact(): boolean`을 핸들에 제공한다.

## 로컬 저장 계약

`LocalDraftController.create({write, onStatus})` → `{save(value), flush(), destroy()}`. write는 기존 `InvitationStorage.putDraft`를 주입한다. save는 입력 복제본을 순서대로 저장하고 Promise<boolean>을 반환한다. 오류는 false와 error 상태로 전달하며 다음 저장을 막지 않는다. flush는 현재 대기열 완료를 반환한다. destroy 이후 새 쓰기/상태 콜백은 차단하고 이미 시작된 쓰기는 취소됐다고 주장하지 않는다. 상태는 `{state: 'saving'|'saved'|'error', revision}`이며 이전 저장 완료를 최신 저장 완료처럼 표시하지 않는다.

보관함의 기존 `{id,title,createdAt,source,html}`와 레거시 마이그레이션은 그대로 둔다. 이번 분리에서 데이터 포맷까지 동시에 바꾸지 않는다.

## 후속 클라우드 설계 방향

계정 없는 편집 → 계정 저장/발행 시 로그인 → 수신자는 로그인 없이 열람. 일반 로그인은 이메일/비밀번호를 잠정 기준으로 하되 인증 제공자 선택 시 이메일 인증·재설정까지 확정한다. 카카오와 이메일 계정은 인증된 명시적 연결을 사용하고 이메일 일치만으로 병합하지 않는다.

서버 레코드는 제작 JSON 바깥에 ownerId/schemaVersion/draftRevision/publishedRevision을 보관한다. 초안과 공개 스냅샷을 분리하고 재발행 성공 시 같은 공개 URL이 새 버전을 가리키게 한다. 모든 비공개 읽기/쓰기에 소유권 검사를 적용한다. 비동기 저장은 계정·문서·revision에 귀속해 전환 중 다른 초안에 적용되지 않게 한다.

공개 URL은 `/i/<무작위 식별자>` 형식이다. 추측하기 어려운 링크는 비밀 보장을 뜻하지 않는다. 최초 서버 응답에 og:title/description/image/url을 넣고 대표 이미지는 크롤러 접근 가능한 HTTPS 리소스로 제공한다. 공유 카드는 정적이고 민감한 주소는 기본 제외한다. 파티클·인트로와 별개로 생성한다. 이미지 버전 관리와 발행 취소를 제공하되 이미 전달된 미리보기 회수를 보장하지 않는다.

클라우드 사진은 별도 asset 식별자와 접근 정책이 필요하다. 내보내기 시 허용된 이미지를 해결하고 임베딩하는 경로를 설계하며 현재 data URL 검증을 무작정 완화하지 않는다. 업로드한 임의 HTML을 그대로 공개 호스팅하지 않고 검증한 데이터로 재렌더링한다.

앱은 데이터 계약·API·렌더러부터 공유한다. DOM 제작기는 WebView로 사용할 수 있지만 네이티브 UI 재사용을 보장하지 않는다. 인증 제공자·DB·스토리지·서버 프레임워크 선택은 후속 계획에서 비교/확정한다.

## 완료 조건

편집 모듈에 저장소/인증 의존이 없고, 재마운트 시 이벤트가 중복되지 않으며, 기존 로컬 저장·복원·업로드·독립 HTML·모바일 동작이 유지되면 이번 분리는 완료다. 클라우드 연결 완료와 혼동하지 않는다.
