# Invitation Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로컬 제작 기능을 유지하면서 로그인·클라우드 저장과 독립적으로 연결할 수 있는 제작 모듈을 만든다.

**Architecture:** 기존 core/renderers는 유지하고 app.js에서 편집 상태와 DOM 수명주기를 추출한다. 서비스 조립부는 저장·보관함·완료 화면을 소유하며 로컬 초안 쓰기는 주입 가능한 컨트롤러로 분리한다. 인증·공개 페이지·OG는 후속 프로젝트로 경계를 정의한다.

**Tech Stack:** Vanilla JavaScript, HTML/CSS, IndexedDB, Node test runner, 기존 Playwright 검사 도구.

**Spec:** `docs/superpowers/specs/2026-09-10-invitation-module-design.md`

## Global Constraints

- 기존 no-build HTML/CSS/JS 구조와 의존성을 유지한다.
- 독립 실행 HTML 다운로드와 기존 JSON/로컬 보관함 호환성을 유지한다.
- 개인 생일 페이지와 사용자의 기존 미커밋 변경은 수정하지 않는다.
- 이번 구현 범위는 로컬 제작 모듈 분리이며 인증·클라우드·공개 발행은 후속 프로젝트다.
- 첫 버전은 문서당 제작기 한 개를 지원하되 해제 후 재마운트를 지원한다.
- 모바일 320/390/768px와 데스크톱 1440px에서 기존 제작 흐름을 유지한다.

## 파일 구성

- 신규 `assets/invitation-editor.js`: 편집 상태·폼·템플릿·이미지·지도·미리보기와 핸들 API.
- 신규 `assets/local-draft-controller.js`: 주입된 write 함수로 초안 쓰기 직렬화.
- 수정 `assets/app.js`: 화면 단계·보관함·마이그레이션·파일 입출력·제작기 조립.
- 수정 `index.html`: 편집 root와 순차 script 로딩.
- 수정 `assets/style.css`, `assets/studio.css`: 편집기 선택자 경계. 초대장 출력 스타일은 변경하지 않는다.
- 신규 `tests/local-draft-controller.test.js`, `scripts/verify-editor-module.cjs`: 저장 계약과 실제 DOM 수명주기 검사.
- 수정 `tests/app-contract.test.js`, `scripts/verify-studio.cjs`: 책임 이동에 맞춘 기존 회귀 검사 유지.

## Task 1: 로컬 저장 경계 추출

**Interfaces:** `LocalDraftController.create({write, onStatus})` → spec의 save/flush/destroy 계약. 기존 storage API는 변경하지 않는다.

- [ ] `node --test tests/*.test.js`와 기존 `scripts/verify-studio.cjs`를 실행해 시작 상태를 기록한다. 브라우저 검사는 별도 터미널의 `python3 -m http.server 4173 --bind 127.0.0.1`과 `PLAYWRIGHT_MODULE=/Users/jaeseoh/.agents/skills/gstack/node_modules/playwright node scripts/verify-studio.cjs`를 사용한다. 포트 사용 중이면 기존 서버의 프로젝트 응답을 확인하고 재사용한다.
- [ ] `tests/local-draft-controller.test.js`에 복사·순서·실패 후 복구 테스트를 추가한다. 테스트 핵심:

```js
const writes = [];
const controller = LocalDraftController.create({
  write: async value => { writes.push(value.title); },
  onStatus: () => {}
});
const value = { title: 'First' };
const first = controller.save(value);
value.title = 'Mutated';
const second = controller.save({ title: 'Second' });
assert.equal(await first, true);
assert.equal(await second, true);
assert.deepEqual(writes, ['First', 'Second']);
```

- [ ] `node --test tests/local-draft-controller.test.js`로 새 모듈 부재에 따른 실패를 확인한다.
- [ ] 신규 컨트롤러에 CommonJS/browser export를 제공하고 다음 직렬화 원칙을 구현한다. 상태 완료 통지는 캡처한 revision이 최신일 때만 전달한다.

```js
const snapshot = JSON.parse(JSON.stringify(value));
const currentRevision = ++revision;
const operation = queue.then(() => write(snapshot));
queue = operation.catch(() => {});
```

save는 operation 성공/실패를 boolean으로 변환하고 해당 최신 상태를 통지한다. destroy는 새 save에 false를 반환하고 콜백을 막는다. flush는 queue를 반환한다.
- [ ] 실패하는 write 다음 성공 write, 오래된 완료 상태 억제, destroy 후 쓰기 차단 테스트를 추가하고 같은 명령으로 통과시킨다. 기존 app 연결은 Task 3에서 수행한다.
- [ ] 파일 두 개만 명시적으로 stage하고 Lore 형식으로 커밋한다. intent는 `Keep draft failures from blocking subsequent edits`, Tested에는 실제 명령을 기입한다.

## Task 2: 편집기 API와 수명주기 추출

**Interfaces:** spec의 `InvitationEditor.mount`와 6개 핸들 메서드(getValue/setValue/isBusy/destroy/validateForExport/confirmReplyContact)를 따른다. onChange는 callback이며 핸들 메서드가 아니다.

- [ ] `scripts/verify-editor-module.cjs`를 기존 브라우저 검사와 같은 Playwright 로딩 방식으로 추가한다. 브라우저에서 신규 모듈 script를 로드하고 기존 편집 DOM의 복제 fixture를 사용한다. 첫 핵심 assertion:

```js
const changes = [];
const editor = InvitationEditor.mount(root, {
  initialValue: { title: 'Original' },
  onChange: event => changes.push(event),
  onError: error => { throw new Error(error.message); }
});
const copy = editor.getValue();
copy.title = 'Outside mutation';
if (editor.getValue().title !== 'Original') throw new Error('Mutable state leaked');
editor.setValue({ title: 'Loaded' });
if (changes.length !== 0) throw new Error('Load emitted user edit');
editor.destroy();
```

- [ ] 새 검사 실행 시 InvitationEditor 부재로 실패하는지 확인한다.
- [ ] app.js의 getFormData/fillForm, 항목 편집, renderTemplates/applyPendingTemplate/undoTemplateApplication, 사진·배경 처리, 지도·미리보기 및 관련 이벤트를 editor의 mount 클로저로 옮긴다. 기존 구현을 재사용하고 템플릿 렌더링을 복제하지 않는다. module 초기화에서 자동 init을 호출하지 않는다. 수명주기 기본 패턴:

```js
const abort = new AbortController();
let generation = 0;
let destroyed = false;
root.addEventListener('input', handleInput, { signal: abort.signal });
function destroy() {
  if (destroyed) return;
  destroyed = true;
  generation += 1;
  abort.abort();
}
```

실제 handleInput은 기존 폼 처리 함수를 연결한다. destroy에 기존 지도 정리 함수, observer disconnect, timer 해제, 소유한 object URL 해제를 포함한다. 비동기 이미지/지도 완료 시 시작 generation과 destroyed를 검사한다. 선택자는 root 기준으로 바꾸고 body 단계 상태는 app에 둔다.
- [ ] 같은 fixture를 destroy 후 다시 mount하고 입력 한 번에 onChange 한 번, 진행 중 setValue의 EDITOR_BUSY, destroy 뒤 늦은 이미지 완료의 무변경을 브라우저 assertion으로 검사한다.
- [ ] `tests/app-contract.test.js`의 소스 추출 위치를 새 소유 파일로 옮기되 기존 검증 내용을 삭제하거나 완화하지 않는다. Node 전체 검사와 모듈 브라우저 검사를 통과시킨다.
- [ ] 관련 파일만 커밋한다. intent는 `Make invitation editing independent of its host lifecycle`로 하고 검증 범위·미검증 항목을 Lore trailers로 기록한다.

## Task 3: 서비스 조립부 연결 및 모바일 회귀 검증

**Interfaces:** Task 1의 컨트롤러와 Task 2의 editor를 app에서 연결한다. 기존 InvitationStorage와 InvitationCore API는 유지한다.

- [ ] 기존 브라우저 검사에 제목 편집 → 새로고침 복원, 저장 실패 시 성공 표시 금지, 템플릿 변경 후 내용 유지 assertion을 추가한다. 신규 module-only fixture에서는 editor에 `InvitationStorage`를 제공하지 않아 저장 의존성이 없는지 검사한다.
- [ ] index.html에 `#invitation-editor-root`를 정의하고 core 의존 scripts → local-draft-controller → invitation-editor → app 순서로 로드한다. app 연결의 핵심:

```js
const drafts = LocalDraftController.create({
  write: value => InvitationStorage.putDraft(value),
  onStatus: renderDraftStatus
});
const editor = InvitationEditor.mount(document.querySelector('#invitation-editor-root'), {
  initialValue,
  onChange: ({ value }) => { void drafts.save(value); },
  onError: renderEditorError
});
```

initialValue는 기존 초안 복원 결과다. renderDraftStatus/renderEditorError는 app의 기존 상태/오류 표시 영역을 사용해 구현한다. 저장 완료는 실제 write 성공 이후에만 표시한다. 보관함 선택은 기존 파싱 뒤 editor.setValue에 전달하고 기존 제품 동작대로 활성 초안을 명시적으로 저장한다. 다운로드는 spec의 busy·검증·연락처 확인 순서를 유지한다.
- [ ] 편집기 전용 CSS를 root 범위로 제한한다. studio.css를 standalone HTML에 포함시키지 않는다. 모바일 dock·보관함·완료 화면은 app에 유지한다. 분리 전후 외형 변화가 있으면 의도하지 않은 회귀로 수정한다.
- [ ] `node --test tests/*.test.js`, 기존 studio 브라우저 검사, 새 module 브라우저 검사, `git diff --check`를 실행한다. 320/390/768/1440px에서 입력·사진·템플릿·저장·복원·다운로드를 확인하고 독립 HTML의 한국어 긴 제목/10개 일정 및 외부 에디터 script 의존 부재를 확인한다.
- [ ] README.md에 module API, 책임 경계, 실행 명령, 로컬 viewer와 공개 URL의 차이를 기록한다. 관련 파일만 커밋하고 인증 구현 완료로 표현하지 않는다.

## 후속 프로젝트 순서와 출시 게이트

1. **인증 + 내 초대장 저장:** 카카오/이메일 로그인, 이메일 인증·복구, 계정 연결, 서버 소유권 검사, 사진 저장, 충돌 감지, 회원 탈퇴 시 데이터 처리. 공급자 선택과 비용·운영 요구를 확정한 별도 구현 계획을 작성한다. 다른 계정의 초안/사진 접근 차단과 로그인 중 초안 보존이 통과 조건이다.
2. **발행 + OG:** 공개 스냅샷/고정 URL, 명시적 재발행, 발행 취소, 대표 카드 생성과 미리보기. OG는 이 단계의 필수 범위다. JS 없이 받은 HTML의 메타데이터, 크롤러 이미지 접근, 발행 실패 시 기존 버전 유지, 취소 뒤 원본 접근 차단을 검사한다.
3. **공유 + 모바일 QA:** 링크 복사, 지원 환경의 공유 시트와 복사 fallback, 카카오 공유 연동 필요성 판단, 실제 iOS/Android 브라우저와 카카오톡 미리보기 확인. 브라우저 자동화 결과만으로 실제 카카오 미리보기 통과를 주장하지 않는다.

## 계획 자체 검토

- 책임 경계·저장 오류: Task 1/3, 수명주기·모듈 계약: Task 2, 기존 데이터·출력·모바일 호환: Task 3으로 대응한다.
- 스키마 변경·인증 공급자 도입·새 프레임워크·공개 배포는 이번 작업에 포함하지 않는다.
- 각 커밋은 실행 시점의 검증 결과를 기록하며 push는 별도 요청 범위에 따른다.
