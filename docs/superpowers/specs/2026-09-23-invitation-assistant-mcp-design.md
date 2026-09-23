# 초대장 어시스턴트 (LLM + MCP 서버) 설계

- 날짜: 2026-09-23
- 상태: 초안 — 사용자 검토 대기
- 관련: `docs/superpowers/specs/2026-09-10-anonymous-publishing-design.md` (발행 API), `docs/superpowers/specs/2026-09-05-multi-occasion-template-system-design.md` (템플릿 카탈로그)

## 1. 목표

사용자가 "23일 17시 선릉 돈그리아 초대장"처럼 한 줄로 말하면, 빠진 정보(시간·장소·주최자 등)를 되묻고, 확인을 받은 뒤 발행된 초대장 링크(`https://<domain>/i/<id>`)를 돌려주는 어시스턴트를 만든다.

외부 사용자에게 **MCP 서버**(`https://<domain>/mcp`, Streamable HTTP)로 공개한다. Claude.ai 커스텀 커넥터, Claude Code, ChatGPT, Cursor 등 MCP 호스트에서 URL 하나로 붙일 수 있다.

사용자 결정 사항(질의응답으로 확정):

| 항목 | 결정 |
|---|---|
| 결과 흐름 | 대화형 어시스턴트 — 빠진 필드는 되묻고, 요약을 확인받은 뒤 링크 생성 |
| 남용 방지 | IP별 시간당 한도 + 서비스 전체 일일 상한 (발행 한도와 같은 Mongo 원자 카운터 패턴) |
| 모델 | Claude Opus 5 (`claude-opus-5`) |
| 공개 형태 | MCP 서버 (웹 채팅 UI·카카오톡·Claude Code 플러그인은 이번 범위 아님) |

## 2. 검토한 접근

### A. 도구만 제공하는 MCP (서버 측 LLM 호출 없음)
호스트 LLM(Claude.ai 등)이 문장을 해석하고 되묻기까지 전부 담당한다. 서버는 `publish_invitation` 같은 결정적 도구만 노출한다.
- 장점: API 키·비용 없음, 구현 최소.
- 단점: 호스트 모델 품질에 따라 결과가 들쭉날쭉하다(날짜 해석, 템플릿 선택, 문구 작성). 나중에 웹 채팅 UI를 붙이려면 엔진을 새로 만들어야 한다. 사용자가 명시적으로 고른 "Opus 5로 LLM 개발"과도 어긋난다.

### B. 서버 측 작성 엔진(Opus 5) + MCP 래퍼 — **권장**
서버 안에 "작성 엔진"을 두고 Opus 5가 문장 → 구조화된 초안(JSON)을 만든다. MCP 도구는 이 엔진과 기존 발행 유스케이스를 얇게 감싼다. 호스트 LLM은 사용자와의 대화(되묻기 전달, 확인)만 맡는다.
- 장점: 어느 호스트에서 써도 같은 품질. 엔진이 순수 모듈이라 나중에 웹 채팅·다른 채널에서 재사용 가능. 구조화 출력으로 스키마가 보장된다.
- 단점: 호출당 LLM 비용(초안 1회당 수 센트 수준)과 지연(수 초). API 키를 서버에 보관해야 한다.

### C. 하이브리드 (결정적 도구 + 문구 작성만 Opus 5)
날짜·장소 파싱은 정규식으로, 제목·메시지 문구만 모델이 쓴다.
- 장점: 비용 절감.
- 단점: 한국어/영어 상대 날짜("이번 주 토요일 저녁") 파싱기를 직접 유지해야 하고, 두 경로가 갈라져 테스트 표면이 두 배가 된다. YAGNI.

**결정: B.** 이유는 사용자가 이미 "Opus 5로 LLM 개발"을 골랐고, 외부 공개 서비스에서는 호스트마다 다른 결과보다 일관된 결과가 중요하기 때문이다.

## 3. 아키텍처

```
MCP 호스트 (Claude.ai / Claude Code / ChatGPT / Cursor)
   │  JSON-RPC over Streamable HTTP  POST /mcp
   ▼
api/mcp.js  (Vercel)   ──┐
server/index.cjs (/mcp) ─┴─▶ server/mcp/handler.cjs
                              │  McpServer + WebStandardStreamableHTTPServerTransport (stateless)
                              │  tools: list_occasions · draft_invitation · publish_invitation · revoke_invitation
                              ▼
                         server/assistant/
                           engine.cjs      draft(request) → Claude Opus 5 구조화 출력 → 초안 + 빠진 항목
                           materialize.cjs 초안 + 템플릿 프리셋 → 발행용 invitation 레코드
                           catalog.cjs     invitation-data.json에서 행사/템플릿 목록 (ko/en 이름)
                           quota.cjs       IP 시간당 / 일일 상한 (Mongo 카운터)
                              │
                              ▼
                         server/publishing/use-case.cjs  publishInvitation / delete (기존 그대로)
                         server/storage/mongo-publications.cjs (카운터 재사용)
```

원칙:
- **엔진은 순수 모듈.** `server/assistant/engine.cjs`는 `createMessage` 함수를 주입받는다(테스트에서는 가짜, 운영에서는 `@anthropic-ai/sdk`). MCP 계층은 엔진을 호출만 한다.
- **무상태.** 서버는 대화 상태를 저장하지 않는다. 호스트가 직전 `draft`를 다음 호출에 그대로 넘긴다. Mongo에는 카운터와 발행 레코드만 쓴다(기존과 동일).
- **발행 경로는 하나.** MCP도 `publishInvitation` 유스케이스를 그대로 쓴다. 검증(`server/validation.cjs`), 만료 계산, 발행 한도, 관리 토큰 방식이 모두 웹 스튜디오와 같다.

### 3.1 의존성 결정

`package.json`에 의존성 두 개를 추가한다(현재는 `mongodb` 하나).

| 패키지 | 버전 | 이유 |
|---|---|---|
| `@anthropic-ai/sdk` | ^0.128.0 | Claude 호출. claude-api 스킬 규칙상 공식 SDK 사용(raw fetch는 사용자가 명시 요청할 때만). CJS `require` 지원 확인됨. |
| `@modelcontextprotocol/server` | ^2.0.0 | MCP 서버 + Streamable HTTP 전송. 프로토콜 버전 협상·JSON-RPC 배치·에러 형식을 직접 구현하지 않기 위해 채택. CJS `require` 지원 확인됨. `fromJsonSchema()`로 JSON Schema를 그대로 쓰므로 zod를 직접 다루지 않는다(내부 의존성으로만 설치됨). |

`@modelcontextprotocol/node`(hono 기반 어댑터)는 쓰지 않는다. 대신 Node `req/res` ↔ 웹 표준 `Request/Response` 변환을 `server/mcp/node-adapter.cjs`(약 30줄)로 직접 둔다. Node 22 전역 `Request`/`Response`로 충분하다.

## 4. 컴포넌트

### 4.1 `server/assistant/catalog.cjs`
`invitation-data.json`을 읽어 모델과 호스트에 줄 요약 목록을 만든다.
- `listOccasions(language)` → `[{id, name, group}]` (ko/en 이름은 기존 `content-en.json` 오버레이 규칙을 따른다).
- `listTemplates()` → `[{id, occasion, family, name, mood}]` (`mood`는 프리셋의 subtitle/message에서 뽑은 한 줄).
- `resolveTemplate(templateId, occasion)` → 존재하면 그대로, 없으면 해당 occasion의 첫 템플릿, 그것도 없으면 `event`의 첫 템플릿.

### 4.2 `server/assistant/engine.cjs`
```js
createAssistantEngine({ createMessage, model = "claude-opus-5", catalog, now = () => new Date() })
  .draft({ request, answers, draft, language, timeZone, clientKeyHash })
    → { status: "ready" | "needs_info", draft, missing, summary }
```
- 입력 검증(모델 호출 전): `request`·`answers` 각 2,000자 이하, `timeZone`은 `Intl.supportedValuesOf("timeZone")`에 있어야 함(기본 `Asia/Seoul`), `language`는 `ko|en|undefined`, `draft`는 4.5 스키마.
- 시스템 프롬프트에 넣는 것: 오늘 날짜/요일(요청 timeZone 기준), 행사·템플릿 목록, 규칙(사용자가 말하지 않은 시간·장소·주최자를 지어내지 않는다; "23일"은 오늘 이후 가장 가까운 23일; 언어는 요청 문장의 언어를 따르되 `language`가 주어지면 그것; 제목·메시지는 짧고 따뜻하게; 템플릿은 행사와 분위기에 맞게 목록에서만 고른다).
- 사용자 메시지: `request`, 있으면 이전 `draft`(JSON)와 `answers`. 사용자 텍스트는 항상 user 턴에만 넣는다(프롬프트 주입 완화).
- 호출 형태: `messages.create`, `thinking: { type: "adaptive" }`, `output_config: { effort: "medium", format: { type: "json_schema", schema } }`, `max_tokens: 2048`. 출력이 짧아 스트리밍은 쓰지 않는다. 타임아웃 45초, 재시도는 SDK 기본(2회).
- 모델 출력은 4.5 스키마로 다시 검증한다(모델을 신뢰하지 않는다). `dateTime`은 `YYYY-MM-DDTHH:mm`이고 오늘 이후 `maxEventLeadDays`(400일) 이내여야 한다. 아니면 `needs_info`로 강등하고 해당 필드를 `missing`에 넣는다.
- `status`: `title`, `dateTime`, `location`이 모두 있으면 `ready`, 아니면 `needs_info`. `host`는 선택(없으면 되묻지 않고 비워 둠 — 모델이 `missing`에 넣을 수는 있음).
- `summary`: 호스트가 사용자에게 그대로 보여 줄 한 문단(요청 언어).

### 4.3 `server/assistant/materialize.cjs`
`materialize(draft, { catalog })` → 발행 API가 받는 `invitation` 객체.
- `resolveTemplate`로 프리셋을 고르고 `templateId, layoutFamily, introEffect, particleEffect, particleSize, particleScale, particleAmount, englishFont, koreanFont`를 프리셋에서 복사한다.
- 초안 필드 `title, subtitle, dateTime, timeZone, host, location, message`를 덮어쓴다.
- `dateLabel`은 `Intl.DateTimeFormat(language, { dateStyle: "long", timeStyle: "short", timeZone })`로 서버가 만든다.
- `mapProvider: "google"`, `mapUrl: https://www.google.com/maps/search/?api=1&query=<encoded location>` (API 키 불필요). `mapEnabled`는 켜지 않는다(임베드 지도는 키가 필요).
- `items: []`, `heroImage` 없음. 프리셋의 샘플 코스·사진·프로필은 가져오지 않는다(남의 샘플 문구가 초대장에 남는 사고 방지).
- 결과는 `validateKnownInvitationFields`를 통과해야 하며, 통과 못 하면 `BAD_REQUEST`로 실패한다.

### 4.4 `server/assistant/quota.cjs`
발행 한도와 같은 방식이되 키 접두어만 다르다.
- `reserveAssistantQuota({ repository, clientKeyHash, now })` → 성공 시 `release()` 함수 반환.
- 카운터 키: `assist:hour:<clientKeyHash>:<hourBucket>`, `assist:day:<dayBucket>`.
- `mongo-publications.cjs`의 `reserveCounter/releaseCounter`를 `reserveQuota(key, limit, now)` 공개 메서드로 노출해 재사용한다(기존 발행 경로 동작은 그대로).
- 한도는 `ASSISTANT_RATE_LIMIT_PER_HOUR`(기본 20), `ASSISTANT_TOTAL_DAILY_LIMIT`(기본 300). 초과 시 `ASSISTANT_RATE_LIMIT` / `ASSISTANT_DAILY_LIMIT`.
- 모델 호출이 실패하면 예약을 되돌린다(실패한 호출은 한도를 소모하지 않음).
- `publish_invitation`은 기존 발행 한도(`PUBLISH_RATE_LIMIT_PER_HOUR` 10, `PUBLISH_TOTAL_DAILY_LIMIT` 100, 평생 1000)를 그대로 적용받는다.

**알려진 한계:** Claude.ai·ChatGPT 같은 호스팅형 클라이언트는 자사 서버 IP로 접속하므로, 그 호스트의 모든 사용자가 IP별 시간당 한도를 나눠 쓴다. 실제 비용 방어선은 일일 상한이다. 시간당 한도는 직접 붙는 클라이언트(Claude Code·Cursor)의 폭주를 막는 용도이며, 운영 중 env로 조정한다. 사용자별 키/OAuth는 이번 범위 밖이다.

### 4.5 초안(draft) 스키마
모델 구조화 출력과 도구 입력이 같은 스키마를 쓴다(`server/assistant/schema.cjs`에 JSON Schema 하나로 정의).

```json
{
  "language": "ko | en",
  "occasion": "<invitation-data.json occasions[].id>",
  "templateId": "<invitation-data.json templates[].id>",
  "title": "string ≤ 80",
  "subtitle": "string ≤ 120 | null",
  "dateTime": "YYYY-MM-DDTHH:mm | null",
  "timeZone": "IANA, 기본 Asia/Seoul",
  "host": "string ≤ 60 | null",
  "location": "string ≤ 120 | null",
  "message": "string ≤ 600 | null",
  "missing": [{ "field": "dateTime | location | host | title", "question": "string" }]
}
```

## 5. MCP 도구

서버 이름 `invitation-maker`, 전송은 무상태 Streamable HTTP(`sessionIdGenerator: undefined`, `enableJsonResponse: true` — 서버리스에서 SSE 장기 연결을 피한다). `GET /mcp`·`DELETE /mcp`는 405.

| 도구 | 입력 | 출력 | 비고 |
|---|---|---|---|
| `list_occasions` | `{ language? }` | 행사 목록 + 템플릿 요약 | 결정적, 한도 소모 없음 |
| `draft_invitation` | `{ request, answers?, draft?, language?, timeZone? }` | `{ status, draft, missing, summary }` | Opus 5 호출, 어시스턴트 한도 적용 |
| `publish_invitation` | `{ draft, confirmed: true }` | `{ id, url, expiresAt, managementToken }` | 발행 한도 적용. `confirmed`가 `true`가 아니면 `BAD_REQUEST` |
| `revoke_invitation` | `{ id, managementToken }` | `{ revoked: true }` | 기존 DELETE와 동일 |

도구 설명문(호스트 LLM이 읽는 지시)에 대화 규칙을 담는다:
1. 사용자의 한 줄 요청을 `draft_invitation`에 그대로 넘겨라.
2. `status`가 `needs_info`면 `missing[].question`을 사용자에게 묻고, 답을 `answers`에, 직전 `draft`를 `draft`에 넣어 다시 호출하라.
3. `ready`가 되면 `summary`를 보여 주고 **명시적 확인**을 받은 뒤에만 `publish_invitation`을 `confirmed: true`로 호출하라.
4. 발행 결과의 `url`과 `managementToken`을 사용자에게 전달하고, 토큰은 삭제에 필요하니 보관하라고 안내하라. 토큰은 서버에 해시로만 남는다.

`url`은 절대 URL이다: `PUBLIC_BASE_URL` env가 있으면 그것, 없으면 요청의 `x-forwarded-proto`/`host`로 만든다(기존 `server/http.cjs`의 원본 판별 로직 재사용).

## 6. 데이터 흐름 (정상 경로)

1. 사용자: "23일 17시 선릉 돈그리아 초대장"
2. 호스트 → `draft_invitation({ request })`
3. 서버: 입력 검증 → 어시스턴트 한도 예약 → Opus 5 구조화 출력 → 출력 재검증 → `{ status: "needs_info", draft: { title: "돈그리아에서 저녁 한 끼", dateTime: "2026-10-23T17:00", location: "선릉 돈그리아", occasion: "event", templateId: "..." }, missing: [{ field: "host", question: "초대하는 분 이름을 알려 주세요." }], summary }`
4. 호스트가 질문을 전달, 사용자 답 → `draft_invitation({ request, draft, answers: "재성" })` → `ready`
5. 호스트가 `summary`를 보여 주고 확인 → `publish_invitation({ draft, confirmed: true })`
6. 서버: `materialize` → 관리 토큰·멱등 키 생성(서버가 만든다; MCP 클라이언트는 멱등 키를 주지 않음) → `publishInvitation` → `{ url: "https://<domain>/i/<id>", managementToken, expiresAt }`

## 7. 에러 처리

- 도구 실패는 MCP 도구 결과 `isError: true`에 `{ code, message }` JSON 텍스트로 돌려준다. 프로토콜 오류(잘못된 JSON-RPC, 지원하지 않는 메서드)는 SDK가 JSON-RPC 에러로 처리한다.
- 코드: 기존 `PUBLISHING_ERROR_MESSAGES` 전부 + `ASSISTANT_RATE_LIMIT`, `ASSISTANT_DAILY_LIMIT`, `ASSISTANT_UNAVAILABLE`(키 없음·모델 오류·타임아웃), `ASSISTANT_BAD_OUTPUT`(재검증 실패 후에도 복구 불가). 메시지는 영어 한 줄(호스트가 번역).
- Mongo 미설정(`repository == null`) → `draft_invitation`·`publish_invitation`·`revoke_invitation`이 `REPOSITORY_UNAVAILABLE`(발행 API와 동일). 한도 없이 외부에 LLM을 열지 않는다. `list_occasions`는 정적 카탈로그만 읽으므로 그대로 동작한다.
- `ANTHROPIC_API_KEY` 미설정 → `draft_invitation`만 `ASSISTANT_UNAVAILABLE`, 나머지 도구는 동작.
- 모델 오류(`APIError`, 타임아웃)는 로그에 요청 ID만 남기고 사용자 텍스트는 남기지 않는다.
- 요청 본문 상한 64KB(`draft` + 텍스트면 충분). 초과 시 413.

## 8. 보안·개인정보

- 인증 없음(공개 플러그인). 방어는 한도·입력 상한·`max_tokens`·타임아웃.
- 관리 토큰은 발행 응답에 한 번만 평문으로 나가고 저장은 해시(기존과 동일).
- API 키는 서버 env에만 둔다. 클라이언트로 나가는 어떤 응답에도 모델 원문 출력·시스템 프롬프트·키를 포함하지 않는다.
- 사용자 입력은 초대장 본문이 될 텍스트뿐이다. 이메일·전화번호 등을 받는 필드는 없다. 개인정보처리방침에 "AI 어시스턴트 사용 시 입력 문장이 Anthropic API로 전송된다"는 항목을 추가한다(`privacy.html` ko/en).
- Host/Origin 검증: 공개 서버이므로 임의 Origin 허용. 로컬 `server/index.cjs`에서는 기존 `PUBLISH_ALLOWED_ORIGIN` 규칙을 그대로 적용하지 않는다(MCP 호스트는 브라우저가 아니다).

## 9. 배포·설정

- `vercel.json`: `{ "src": "/mcp", "dest": "/api/mcp.js" }` 추가, `functions["api/mcp.js"].maxDuration = 60`.
- `api/mcp.js`: `api/invitations.js`와 같은 패턴(핸들러 캐시, env에서 config).
- `server/http.cjs`: `/mcp`를 `server/mcp/handler.cjs`로 위임(로컬 개발·테스트용).
- `.env.example` 추가: `ANTHROPIC_API_KEY`, `ASSISTANT_MODEL=claude-opus-5`, `ASSISTANT_RATE_LIMIT_PER_HOUR=20`, `ASSISTANT_TOTAL_DAILY_LIMIT=300`, `PUBLIC_BASE_URL=`.
- `server/config/assistant.cjs`: env → config(기존 `publishing.cjs` 패턴).

## 10. 테스트

- **엔진 단위 테스트**(`tests/assistant-engine.test.js`): 가짜 `createMessage`로 구조화 출력 픽스처를 돌려주며 — ready/needs_info 판정, 입력 길이·timeZone 검증, 모델 출력 재검증(잘못된 dateTime → needs_info 강등, 없는 templateId → 폴백), 실패 시 한도 반납.
- **materialize 테스트**: 프리셋 복사 범위, `items: []`, `dateLabel` ko/en, `mapUrl` 인코딩, `validateKnownInvitationFields` 통과.
- **MCP 통합 테스트**(`tests/mcp-handler.test.js`): 핸들러를 임시 포트에 띄우고 `fetch`로 JSON-RPC `initialize` → `tools/list` → `tools/call`을 순서대로 호출한다. 메모리 저장소(`tests/`의 기존 fake repository)와 가짜 모델로 전 경로를 검증한다. 추가 devDependency 없음.
- **한도 테스트**: `publishing-mongo` CI 잡에 어시스턴트 카운터 케이스 추가(시간당 초과, 일일 초과, 실패 시 반납).
- **라이브 스모크**(`scripts/smoke-assistant.cjs`, CI 제외): 실제 키로 "23일 17시 선릉 돈그리아 초대장"을 넣어 초안이 나오는지 확인. 실행 방법을 README에 적는다.
- TZ 매트릭스(UTC, America/Los_Angeles)에서 `dateLabel`·"오늘" 계산이 요청 `timeZone` 기준으로 고정되는지 확인한다.

## 11. 문서

- `README.md`: "AI 어시스턴트로 만들기 (MCP)" 절 — 커넥터 URL `https://<domain>/mcp`, Claude.ai/Claude Code/Cursor 연결 예시, env 목록.
- `guide.html`(ko/en): 사용자용 짧은 안내 한 절(URL 붙이는 법, 무엇을 물어보는지, 링크 만료 규칙은 스튜디오와 동일).
- `privacy.html`(ko/en): AI 처리 항목 추가.

## 12. 범위 밖 (이번에 하지 않음)

웹사이트 채팅 UI, 카카오톡 봇, Claude Code 플러그인 패키징, OAuth/사용자별 API 키, 히어로 이미지 생성, RSVP, 초안 서버 저장(대화 이어하기), 지도 임베드 자동 활성화.
