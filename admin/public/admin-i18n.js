/* Operator-console copy, both languages in one file.

   Why this lives in admin/public/ rather than assets/i18n/:

   The admin is one operator looking at a list, served by its own process from
   its own static root (admin/index.cjs). Its vocabulary — "폐기", "CSRF", the
   server error codes — has no business in the dictionaries that ship to every
   guest who opens an invitation, and the public build has no reason to carry
   it. So the console keeps its own copy.

   What it does NOT keep its own copy of is the ENGINE. Resolution order,
   the storage key and the <html lang> handling all come from
   assets/i18n/i18n.js, which admin/http.cjs serves at /admin/i18n.js. That is
   what makes the operator's language choice in the studio carry over to here
   instead of being a second, separately-drifting mechanism.

   ko and en sit side by side so a change to one is visibly a change to both;
   tests/admin.test.js holds their key sets identical. */
(function exposeAdminDictionaries(root, factory) {
  const dictionaries = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = dictionaries;
  }

  for (const [language, dictionary] of Object.entries(dictionaries)) {
    root.InvitationI18n?.register(language, dictionary);
  }
  root.AdminDictionaries = dictionaries;
})(typeof globalThis === "object" ? globalThis : this, function createAdminDictionaries() {
  return {
    ko: {
      lang: {
        switcherLabel: "언어 선택",
        switcherDescription: "관리 화면 표시 언어"
      },
      admin: {
        documentTitle: "초대장 발행 관리",
        brandLabel: "Invitation Studio 공개 사이트로 이동",
        brandTitle: "공개 사이트로 이동",
        headerNote: "초대장 발행을 관리하는 운영자 공간",
        footerNote: "작은 초대, 소중한 순간.",

        loginHeading: "발행 관리",
        passwordLabel: "관리자 비밀번호",
        loginButton: "로그인",

        listHeading: "발행 목록",
        logout: "로그아웃",
        searchLabel: "발행 검색 (ID 또는 제목)",
        searchPlaceholder: "ID 또는 제목으로 검색",
        refresh: "새로고침",
        paginationLabel: "발행 목록 페이지",
        previous: "이전",
        next: "다음",

        columnTitle: "제목",
        columnId: "ID",
        columnCreated: "발행일",
        columnExpires: "만료",
        columnActions: "관리",

        rowDetail: "상세",
        rowOpen: "열기",
        rowRevoke: "폐기",
        listEmpty: "발행된 초대장이 없습니다.",
        listStatus: "{total}개 발행 · {page} / {pages} 페이지",
        noDate: "없음",
        confirmRevoke: "이 발행 링크를 폐기할까요?",

        detailHeading: "상세",
        closeDetail: "닫기",
        detailInvitation: "초대장 정보",
        detailCourses: "코스 안내",
        detailRaw: "원본 데이터 보기",
        fieldTitle: "제목",
        fieldId: "ID",
        fieldCreated: "발행일",
        fieldExpires: "만료",
        fieldPublicUrl: "공개 링크",
        fieldHost: "주최자",
        fieldDate: "날짜",
        fieldLocation: "장소",
        fieldMessage: "메시지",
        fieldTemplate: "템플릿",
        fieldLayout: "레이아웃",
        fieldIntro: "인트로 효과",
        fieldParticle: "파티클 효과",
        fieldFonts: "폰트",

        /* One entry per error code admin/http.cjs can return. A test
           cross-checks the server source against these keys, so a new code
           cannot ship showing the operator a bare CSRF_INVALID. */
        errorFallback: "요청에 실패했습니다.",
        errorAdminAuthRequired: "로그인이 필요합니다.",
        errorInvalidAdminPassword: "비밀번호가 올바르지 않습니다.",
        errorLoginRateLimited: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.",
        errorCsrfInvalid: "요청이 만료되었습니다. 새로고침 후 다시 시도해주세요.",
        errorNotFound: "요청한 항목을 찾을 수 없습니다.",
        errorRepositoryUnavailable: "일시적으로 서비스를 사용할 수 없습니다.",
        errorBadRequest: "요청이 올바르지 않습니다.",
        errorMethodNotAllowed: "허용되지 않는 요청입니다."
      }
    },

    en: {
      lang: {
        switcherLabel: "Choose language",
        switcherDescription: "Console language"
      },
      admin: {
        documentTitle: "Publication admin",
        brandLabel: "Go to the public Invitation Studio site",
        brandTitle: "Go to the public site",
        headerNote: "Operator console for published invitations",
        footerNote: "Small invitations, lasting moments.",

        loginHeading: "Publication admin",
        passwordLabel: "Admin password",
        loginButton: "Sign in",

        listHeading: "Publications",
        logout: "Sign out",
        searchLabel: "Search publications (ID or title)",
        searchPlaceholder: "Search by ID or title",
        refresh: "Refresh",
        paginationLabel: "Publication list pages",
        previous: "Previous",
        next: "Next",

        columnTitle: "Title",
        columnId: "ID",
        columnCreated: "Published",
        columnExpires: "Expires",
        columnActions: "Actions",

        rowDetail: "Details",
        rowOpen: "Open",
        rowRevoke: "Revoke",
        listEmpty: "Nothing has been published.",
        listStatus: "{total} published · page {page} of {pages}",
        noDate: "None",
        confirmRevoke: "Revoke this published link?",

        detailHeading: "Details",
        closeDetail: "Close",
        detailInvitation: "Invitation",
        detailCourses: "Course notes",
        detailRaw: "Show raw data",
        fieldTitle: "Title",
        fieldId: "ID",
        fieldCreated: "Published",
        fieldExpires: "Expires",
        fieldPublicUrl: "Public link",
        fieldHost: "Host",
        fieldDate: "Date",
        fieldLocation: "Place",
        fieldMessage: "Message",
        fieldTemplate: "Template",
        fieldLayout: "Layout",
        fieldIntro: "Intro effect",
        fieldParticle: "Particle effect",
        fieldFonts: "Fonts",

        errorFallback: "The request failed.",
        errorAdminAuthRequired: "You need to sign in.",
        errorInvalidAdminPassword: "That password is not correct.",
        errorLoginRateLimited: "Too many sign-in attempts. Please wait a moment and try again.",
        errorCsrfInvalid: "This request expired. Refresh the page and try again.",
        errorNotFound: "That item could not be found.",
        errorRepositoryUnavailable: "The service is temporarily unavailable.",
        errorBadRequest: "That request was not valid.",
        errorMethodNotAllowed: "That request method is not allowed."
      }
    }
  };
});
