# Archify · 초대장 메이커

[인터랙티브 HTML](system.html) · [원본 JSON](system.architecture.json) · [브라우저 캡처 모음](system.visual-check.html)

공식 도구: https://github.com/tt-a1i/archify

Codex용 글로벌 스킬 `~/.agents/skills/archify`에 설치했다. 애플리케이션 런타임 의존성은 추가하지 않는다. Archify는 작성한 JSON을 검증·렌더링하는 도구이며, 이 모델의 연결 관계는 아래 코드 근거를 직접 확인해 작성했다. Graphify 자동 추출 결과와 구분한다.

## 설치와 재생성

```sh
npx -y skills add tt-a1i/archify --skill archify --agent codex --global --copy --yes
node "$HOME/.agents/skills/archify/bin/archify.mjs" doctor
```

저장소 루트에서 실행한다. 출력 HTML을 직접 수정하지 말고 원본 JSON을 수정한다.

```sh
node "$HOME/.agents/skills/archify/bin/archify.mjs" validate architecture docs/architecture/archify/system.architecture.json --quality showcase --json
node "$HOME/.agents/skills/archify/bin/archify.mjs" deliver architecture docs/architecture/archify/system.architecture.json docs/architecture/archify/system.html --quality showcase --json > docs/architecture/archify/delivery.json
# deliver가 성공한 경우에만 실행
node "$HOME/.agents/skills/archify/bin/archify.mjs" visual-check docs/architecture/archify/system.html --json
```

설치된 SKILL 메타데이터 버전은 2.17이다. 재설치는 공식 저장소의 당시 버전을 사용하므로 생성 결과가 달라질 수 있다. 한글은 작성 콘텐츠에 적용했으며, 뷰어 고정 메뉴와 HTML 언어 속성은 Archify 기본 영어를 사용한다. GitHub에서 HTML은 다운로드한 뒤 브라우저로 연다. README에는 PNG 미리보기를 표시한다.

## 코드 근거와 범위

검토 기준 커밋: `a043951f7ba2a4e549e72522410f62726890de5a`.

| 연결 | 코드 근거 |
| --- | --- |
| 제작기 → 공개 API | `assets/publishing.js`, `api/invitations.js` |
| 제작기 → IndexedDB | `assets/app.js`, `assets/invitation-storage.js` |
| 공개 뷰어 → 공개 API | `assets/shared-invitation.js` |
| 공개 API → 검증 → 저장소 | `server/http.cjs`, `server/validation.cjs` |
| 저장소 → MongoDB | `server/mongo-repository.cjs` |
| 관리자 → 저장소·인증 | `admin/index.cjs`, `admin/http.cjs`, `admin/session-store.cjs` |

주요 요청·의존 방향을 나타내며 응답 화살표는 생략했다. 공개 API 상자는 Vercel 어댑터와 공통 핸들러를 요약한다. 로컬 공개 실행은 `server/index.cjs`에서 같은 핸들러를 사용한다. 템플릿 렌더링과 분석 SDK의 내부 호출, 향후 리팩토링 구조는 이 그림 범위에서 제외했다. 관리자 화면의 Git 추적 여부나 운영 배포 상태를 보증하는 다이어그램은 아니다.

## 검증 근거

- `doctor`: 필수 런타임 확인 통과.
- `deliver`: showcase 9/9, 오류 0, 경고 0. [해시와 바이트 수](delivery.json).
- `visual-check`: 1440×900, 1600×1000, 1920×1080, 2048×1320 화면에서 넘침 없음. [자동 브라우저 검증](system.visual-check.json).
- 이미지 검토: 2048×1320 밝은/어두운 테마에서 한글, 노드, 연결선, 범례의 겹침과 잘림 없음. `visual_review: passed`. 자동 기록의 `visualReview: pending`은 자동 검사가 시각적 판단을 대신하지 않는다는 의미로 원본 그대로 보존한다.
- `correction_rounds: 1`: 공개 조회 라벨의 노드 겹침을 수정했다.

실제 코드 리팩토링은 수행하지 않았다. 단계별 후보는 [아키텍처 검토](../README.md)를 참고한다.
