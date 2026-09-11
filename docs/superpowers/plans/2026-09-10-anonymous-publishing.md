# Anonymous Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 로그인 없이 2MB 이하 초대장을 MongoDB에 발행하고 독립 브라우저에서 공개 링크로 연다.
**Architecture:** 기존 제작기에 독립 publishing client를 연결하고 Node HTTP/API + Mongo repository로 저장한다. 공개 뷰어는 기존 렌더러를 sandbox iframe에서 재사용한다.
**Tech Stack:** Node >=22, official mongodb driver, vanilla JS, node:test, existing Playwright.
**Spec:** docs/superpowers/specs/2026-09-10-anonymous-publishing-design.md

## Global Constraints

- 요청/저장 데이터 최대 2,000,000 bytes; Base64 포함. 로그인·R2·개별 OG·제작기 분리 제외.
- TTL 기본 0(자동 만료 없음), 설정으로 양수 기간 지원; 읽기에서 즉시 만료 차단.
- 공개 ID Base62 22자리, 별도 관리 토큰, 서버 저장 성공 이후만 링크 표시.
- 기존 미커밋 변경과 개인 초대장 파일을 보존한다. 커밋·푸시·운영 배포는 이번 단계에 수행하지 않는다.

## Task 1 — API 및 실제 Mongo 저장

Files: package.json/lock, server/*.cjs, api/*.js, vercel.json, tests/publishing-server.test.js, scripts/verify-publishing-mongo.cjs, .env.example.
Interface: `createHandler({repository, config})` returns Node HTTP handler; `createMongoRepository` owns indexes, atomic rate/total counters, insert, get and remove. `server/index.cjs` starts same-origin static+API server. POST/GET/DELETE shapes are fixed in spec.

- [x] Write node:test cases exercising HTTP validation, size overflow, authorization, token secrecy, retries, expired reads, quota limits, static path traversal.
- [x] Run failing tests before implementation.
- [x] Implement bounded request reader and strict normalized JSON validation; use `createHash('sha256')` for private tokens/keys and `randomInt(62)` for public ids.
- [x] Add official Mongo driver and actual repository with unique indexes and TTL index. Never silently use in-memory storage in production.
- [x] Run targeted tests and actual Mongo integration including concurrent quota and replay.

## Task 2 — 제작 화면과 공개 뷰어

Files: assets/publishing.js, assets/shared-invitation.js, shared.html, assets/app.js, index.html, assets/studio.css, tests/publishing-client.test.js.
Interface: `InvitationPublishing.mount({getValue,validate,isBusy})` connects DOM and app; getValue returns `getFormData()`, validate uses existing export/contact checks. API contract from spec; URL is relative `/i/<id>`.

- [x] Write tests for byte sizing, durable credentials before POST, retry reuse, error state and deletion.
- [x] Implement one-time client mount, crypto token/idempotency, storage persistence, publish/list/copy/cancel UI. Prevent duplicate pending requests; failed retries preserve snapshot and keys.
- [x] Add public viewer reading GET API and existing renderer. Keep server data isolated using iframe sandbox allow-scripts (without allow-same-origin) and safe popup links.
- [x] Connect app with minimal edits and style at mobile widths without disturbing existing finish actions.
- [x] Run targeted tests and existing app contracts.

## Task 3 — 통합 QA와 운영 안내

Files: scripts/verify-publishing.cjs, README.md, docs/publishing.md, plan checkboxes.

- [x] Start isolated local MongoDB and Node service; persist across process restart.
- [x] Browser contexts A and B: create title+photo at 320/390/768/1440, publish, B opens URL without localStorage, render/photo verify, copy, A cancel, B reload denied.
- [x] Test failed publication preserves editable draft and retries do not create another record; test no storage means no publish.
- [x] Run all Node tests, existing verify-studio, mongo integration, new browser smoke, `git diff --check`.
- [x] Independent review of spec coverage/security/correctness; fix concrete findings and verify affected checks.
- [x] Document local setup, Atlas server-only environment variables, proxy trust, limits, TTL semantics, Vercel setup and credential-dependent production gap.

## Task 4 — 선택적 GA4 방문 집계

Files: assets/analytics-ga4.js, assets/analytics-config.js, index.html, shared.html, tests/analytics-ga4.test.js, docs/analytics.md.

- [x] Check official Google tag docs for manual page_view and default/enhanced measurement behavior.
- [x] Add an empty measurement ID default. No ID/local host/opt-out means no Google script or request.
- [x] Add one sanitized manual page_view per document; generic maker/shared titles and paths, no raw URL/query/hash/referrer/authored content.
- [x] Test gating, duplicate prevention, payload exclusions and script-load failures without sending test traffic to Google.
- [x] Document property creation, measurement ID configuration, enhanced measurement settings, and actual collection verification still needed.

## Final local verification (2026-09-10)

- Full Node suite against isolated local MongoDB: 297 passed, 0 failed, 0 skipped.
- Publishing browser smoke: 320/390/768/1440 widths, independent recipient, photo, copy, revoke, response-loss retry and blocked storage passed.
- Existing Studio browser smoke: four widths and three standalone template cases passed.
- Static packaging, source exclusion, syntax checks, git diff whitespace check passed; npm audit reported 0 vulnerabilities.
- Independent publishing review passed after strict input-validation fixes.
- GA4 uses an empty measurement ID; property registration and real collection remain pending. Atlas credentials and production deployment are also pending; these checks do not establish production publication.
