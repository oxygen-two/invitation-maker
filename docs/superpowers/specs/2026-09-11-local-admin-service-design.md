# 로컬 발행 관리 서비스 설계

## 목표

공개 초대장 발행 API와 운영용 관리 화면을 분리한다. 관리 화면은 로컬에서만 실행하는 별도 Node 서비스로 둬서 현재 Vercel 공개 배포물에 관리자 기능이나 관리자 정적 파일이 섞이지 않도록 한다. 이후 로그인 사용자 기능이나 제작자 모듈이 추가되어도 공개 발행 API, 저장소, 관리자 UI의 경계가 유지되게 한다.

## 결정 사항

- 공개 발행 서버(`server/`)와 관리자 서버(`admin/`)를 별도 프로세스와 경로로 둔다.
- 관리자 실행 명령은 `npm run admin`으로 추가한다. 공개 서비스의 `npm start`와 `build:public`에는 관리자 코드가 포함되지 않는다.
- 관리자 서버는 기존 MongoDB 저장소를 재사용한다. 새 DB나 ORM은 도입하지 않는다.
- 관리자 비밀번호는 `ADMIN_PASSWORD` 환경변수로만 설정한다. 값이 없으면 관리자 서버는 시작하지 않고, 공개 발행 서비스는 영향을 받지 않는다.
- 관리자는 아이디 없이 비밀번호로 로그인한다. 로그인 성공 후 서버 메모리 세션을 발급하고 `HttpOnly`, `SameSite=Lax` 쿠키로 유지한다. 세션은 프로세스 재시작 시 사라지며 기본 수명은 8시간이다.
- 관리자 호스트와 포트는 `ADMIN_HOST`, `ADMIN_PORT`로 설정한다. 기본값은 `0.0.0.0`, `4174`로 하여 localhost 전용으로 강제하지 않는다. 네트워크로 노출할 경우 HTTPS를 제공하는 운영 환경에서 사용하도록 문서에 명시한다.
- 관리자 API는 `/admin/api/*`, 화면은 `/admin`으로 고정한다.
- 관리자 API 응답에는 공개 링크를 만들 수 있는 발행 ID와 메타데이터만 포함한다. 공개 삭제 토큰, 토큰 해시, idempotency 해시는 절대 반환하지 않는다.

## 관리자 기능 범위(MVP)

1. 로그인/로그아웃
2. 발행 목록 조회
3. 제목 또는 ID 검색
4. 페이지 이동
5. 발행 상세 조회
6. 발행 강제 폐기(관리자 세션으로만 수행)
7. 공개 초대장 링크 열기

목록은 최신 발행 순으로 정렬한다. 기본 페이지 크기는 20개이며 `page`, `pageSize`, `q`를 받는다. `pageSize`는 1~100으로 제한하고 서버가 정규화한다. 응답은 다음 형태를 따른다.

```json
{
  "items": [
    {
      "id": "base62-id",
      "title": "초대장 제목",
      "createdAt": "2026-09-11T00:00:00.000Z",
      "expiresAt": null,
      "publicPath": "/shared.html?id=base62-id"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 42,
    "totalPages": 3
  }
}
```

제목은 현재 저장된 invitation JSON에서 안전하게 읽을 수 있는 대표 제목을 사용하고, 제목을 찾을 수 없으면 `(제목 없음)`으로 표시한다. 상세 화면은 메타데이터와 invitation 데이터를 읽기 전용 JSON으로 보여준다.

## HTTP 계약

- `POST /admin/api/login`
  - body: `{ "password": "..." }`
  - 성공: `204`, 세션 쿠키 설정
  - 실패: `401`
- `POST /admin/api/logout`
  - 성공: `204`, 세션 쿠키 삭제
- `GET /admin/api/session`
  - 로그인 상태 확인
- `GET /admin/api/publications?page=1&pageSize=20&q=`
  - 인증 필요, 페이지네이션 목록 반환
- `GET /admin/api/publications/:id`
  - 인증 필요, 상세 반환
- `POST /admin/api/publications/:id/revoke`
  - 인증 필요, 발행 문서 삭제
  - 브라우저 요청은 CSRF 방지를 위해 세션과 함께 발급한 일회성 또는 세션 단위 CSRF 값을 `X-Admin-CSRF` 헤더로 요구한다.

모든 관리자 API는 JSON 오류 형식 `{ "error": "..." }`을 사용한다. 존재하지 않는 발행 ID는 `404`, 잘못된 페이지 값은 서버가 기본값으로 보정하며, 저장소 장애는 `503`으로 응답한다.

## 저장소 변경

기존 `publish`, `get`, `remove` 메서드는 공개 API 호환성을 유지한다. 관리자용으로 다음 메서드를 별도로 추가한다.

- `list({ page, pageSize, query })`: `countDocuments`와 `find/sort/skip/limit`을 사용해 전체 개수와 현재 페이지를 반환한다.
- `getAdmin(id)`: 공개 조회와 분리된 상세 메타데이터를 반환한다.
- `revoke(id)`: 토큰 없이 관리자 권한으로 삭제한다.

목록 검색을 위해 `id`, `createdAt`, `invitation.title` 인덱스를 사용하고, invitation 전체에 대한 정규식 검색은 사용하지 않는다. 초기 구현에서는 기존 데이터 호환을 위해 title이 없는 문서도 정상적으로 표시한다.

## 파일 구조

```text
admin/
  index.cjs          # 관리자 서버 진입점
  http.cjs           # 인증, API 라우팅, 정적 파일 응답
  session-store.cjs  # 메모리 세션/CSRF 관리
  public/
    index.html       # 관리자 화면
    admin.js         # 목록, 페이지 이동, 상세, 폐기
    admin.css        # 관리자 전용 스타일
server/
  mongo-repository.cjs  # 공개/관리자 저장소 메서드 공유
```

관리자 서버는 공개 서버의 정적 파일 서빙 코드와 직접 결합하지 않는다. 관리자 화면의 공개 링크는 `PUBLIC_BASE_URL`이 설정되어 있으면 그 절대 URL을 사용하고, 없으면 공개 서버 기본 주소 `http://127.0.0.1:4173`을 사용한다.

## 보안 및 운영 경계

- `ADMIN_PASSWORD`를 저장소에 기록하거나 로그에 남기지 않는다.
- 비밀번호 비교는 일정 시간 비교 함수를 사용하고, 실패 응답은 동일하게 유지한다.
- 세션 토큰과 CSRF 토큰은 암호학적으로 안전한 난수로 만든다. 서버 메모리에는 해시만 보관한다.
- 폐기 버튼은 확인 단계를 거치며, 폐기 후 목록을 현재 페이지 기준으로 다시 불러온다. 마지막 항목을 지운 경우 이전 페이지로 이동한다.
- 관리자 서비스는 Vercel 함수와 `build:public` 산출물에 포함하지 않는다.
- TTL로 만료된 문서는 MongoDB TTL 인덱스가 정리하므로 목록에서도 자연스럽게 사라진다. TTL 값 자체는 기존 `PUBLISH_TTL_DAYS` 정책을 따른다.

## 검증 기준

- 관리자 비밀번호가 없을 때 `npm run admin`이 명확한 설정 오류로 종료한다.
- 올바른 비밀번호 로그인, 잘못된 비밀번호 거부, 세션 만료, 로그아웃을 HTTP 테스트로 검증한다.
- 목록의 `page`, `pageSize`, `q`, `totalItems`, `totalPages`가 실제 Mongo 문서 수와 일치하는지 검증한다.
- 페이지 경계(빈 페이지, 마지막 페이지 삭제 후 이전 페이지 이동)를 검증한다.
- 관리자 폐기 후 공개 GET이 `404`가 되는지 검증한다.
- 기존 공개 발행 테스트와 `build:public` 결과가 변하지 않는지 검증한다.

## 이후 확장 경계

로그인 회원 기능은 관리자 세션과 별도의 인증 모듈로 추가한다. 제작자 모듈은 관리자 HTTP 핸들러를 가져다 쓰지 않고, 저장소 인터페이스와 발행 서비스 계층만 공유한다. RSVP, 방문자 통계, Google Analytics는 이 MVP 범위에 넣지 않는다.
