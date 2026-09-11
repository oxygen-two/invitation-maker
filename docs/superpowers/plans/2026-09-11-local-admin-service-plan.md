# 로컬 발행 관리자 서비스 구현 계획

> 설계 기준: `docs/superpowers/specs/2026-09-11-local-admin-service-design.md`

## 1. 구성 및 환경 설정

- `server/config.cjs`와 `.env.example`에 `ADMIN_PASSWORD`, `ADMIN_HOST`, `ADMIN_PORT`, `ADMIN_SESSION_TTL_MS`, `PUBLIC_BASE_URL`을 추가한다.
- 관리자 서버의 설정 로더는 기존 공개 설정과 분리해 `admin/config.cjs`에서 읽는다.
- `package.json`에 `admin` 스크립트를 추가하고, 기존 `start`/`build:public`의 동작은 변경하지 않는다.
- 관리자 비밀번호가 없는 경우 시작 시 명확한 설정 오류를 반환한다.

## 2. 저장소 관리자 어댑터

- `server/mongo-repository.cjs`에 공개 API와 분리된 `list`, `getAdmin`, `revoke` 메서드를 추가한다.
- 목록은 `createdAt` 내림차순, `_id` 보조 정렬을 사용하고 `countDocuments`와 `skip/limit`를 함께 실행한다.
- `page`는 1 이상, `pageSize`는 1~100으로 정규화한다. `q`는 발행 ID와 `invitation.title`만 검색해 invitation 전체 정규식 조회를 피한다.
- 응답에서 tokenHash, idempotencyKeyHash, contentHash, clientKeyHash는 제거한다.
- FakeRepository 테스트 구현도 같은 관리자 메서드를 제공해 HTTP 테스트가 Mongo 연결 없이 실행되도록 한다.

## 3. 세션/관리자 HTTP 서버

- `admin/session-store.cjs`에 암호학적 난수 세션/CSRF 토큰, 해시 보관, 만료 및 로그아웃 삭제를 구현한다.
- `admin/http.cjs`에 로그인, 로그아웃, 세션 확인, 페이지 목록, 상세, 폐기 API를 구현한다.
- 인증/CSRF 검사, JSON 오류, 쿠키 속성, 공개 링크 생성 로직을 한 파일의 작은 함수들로 분리한다.
- `admin/index.cjs`에서 Mongo 저장소와 Node HTTP 서버를 조립하고 SIGINT/SIGTERM 시 세션과 DB 연결을 정리한다. 공개 링크는 `PUBLIC_BASE_URL` 또는 공개 서버 기본 주소를 사용한다.

## 4. 관리자 화면

- `admin/public/index.html`, `admin/public/admin.js`, `admin/public/admin.css`를 추가한다.
- 로그인 화면과 목록 화면을 분리하고, 페이지 크기 선택/이전/다음/페이지 번호, ID 검색, 상세 패널, 공개 링크, 폐기 확인을 제공한다.
- 목록이 비었을 때, 검색 결과가 없을 때, 마지막 항목 삭제로 페이지가 줄어들 때의 상태를 명시적으로 처리한다.
- 관리자 정적 파일은 관리자 서버만 서빙하고 `scripts/build-public.cjs` 대상에는 포함하지 않는다.

## 5. 테스트 우선 구현

- 세션 저장소 단위 테스트를 먼저 작성한다: 발급, 해시 비교, 만료, 로그아웃, 잘못된 토큰 거부.
- 관리자 HTTP 테스트를 작성한다: 설정 오류, 로그인 성공/실패, 쿠키, 인증 거부, 페이지네이션 메타데이터, 검색, 상세, CSRF, 폐기.
- Mongo 저장소 관리자 메서드는 기존 Mongo 검증 스크립트 또는 별도 테스트에서 실제 문서 수/정렬/폐기를 확인한다.
- `npm test`, `npm run build:public`, 공개 발행 테스트를 모두 실행해 회귀를 확인한다.

## 6. 문서 및 운영 확인

- `docs/publishing.md`에 `npm run admin`, 환경 변수, 접근 URL, 비밀번호 미설정 오류, 네트워크 노출 시 HTTPS 주의를 추가한다.
- `.env.example`에는 실제 비밀번호를 넣지 않고 자리표시자만 둔다.
- 관리자 코드가 `public/` 결과물이나 Vercel 라우팅에 들어가지 않는지 파일 목록과 `git diff --check`로 확인한다.

## 완료 기준

- 로컬에서 `ADMIN_PASSWORD`를 설정한 뒤 `npm run admin`으로 관리자 화면에 로그인할 수 있다.
- 발행 목록이 최신순으로 보이고 페이지 이동과 검색이 실제 개수와 일치한다.
- 상세 조회와 강제 폐기가 동작하며 폐기된 링크의 공개 조회는 404가 된다.
- 공개 발행 기능과 정적 빌드가 기존 테스트를 통과한다.
