/* Korean studio copy.

   Grouped by the surface a string appears on, not by a flat id space, so a
   translator can open one section and see a whole screen's worth of context.
   Keys must stay identical across every dictionary — tests/i18n.test.js
   compares the key sets and fails on any drift.

   Not in here, deliberately: the English words baked into the template
   artwork (INVITATION, DATE, PLACE, HOST, and the MEET/CAFE/WALK/DINNER
   course labels). Those are decorative typography, conventional on Korean
   invitations too, and translating them breaks the layouts they were
   letterspaced for. They are not translation targets. */
(function exposeDictionaryKo(root, factory) {
  const dictionary = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = dictionary;
  }

  root.InvitationI18n?.register("ko", dictionary);
  root.InvitationDictionaryKo = dictionary;
})(typeof globalThis === "object" ? globalThis : this, function createDictionaryKo() {
  return {
    meta: {
      title: "Invitation Studio",
      description: "마음에 드는 디자인에 나만의 이야기를 담아보세요. 생일부터 소중한 모임까지, 나만의 초대장을 만드는 Invitation Studio.",
      ogLocale: "ko_KR",
      ogTitle: "Invitation Studio · 작은 초대, 소중한 순간",
      ogDescription: "마음에 드는 디자인에 나만의 이야기를 담아보세요. 생일부터 소중한 모임까지, 나만의 초대장을 만들어보세요.",
      ogImageAlt: "봉투 로고와 Invitation Studio — 작은 초대, 소중한 순간",
      twitterTitle: "Invitation Studio · 작은 초대, 소중한 순간",
      twitterDescription: "마음에 드는 디자인에 나만의 이야기를 담아 나만의 초대장을 만들어보세요.",
      twitterImageAlt: "봉투 로고와 Invitation Studio — 작은 초대, 소중한 순간",
      schemaDescription: "생일, 결혼, 모임 등 소중한 날을 위한 모바일 초대장을 무료로 만드는 웹 앱입니다. 회원가입 없이 디자인을 고르고 내용을 채워 사진이 담긴 HTML 파일로 내려받거나, 원하면 링크로도 공유할 수 있습니다."
    },

    lang: {
      switcherLabel: "언어 선택",
      switcherDescription: "스튜디오 표시 언어"
    },

    header: {
      tagline: "작은 날도, 특별하게.",
      footerNote: "작은 초대, 소중한 순간."
    },

    nav: {
      stepsLabel: "제작 단계",
      gallery: "01 디자인",
      edit: "02 내용 편집",
      finish: "03 완성",
      library: "보관함",
      viewsLabel: "화면 전환",
      viewEditor: "제작",
      viewPreview: "미리보기",
      viewLibrary: "보관함"
    },

    maker: {
      eyebrow: "Make it personal",
      headingGallery: "어떤 날을 초대할까요?",
      headingEdit: "나만의 초대장을 완성하세요",
      intro: "마음에 드는 디자인에 나만의 이야기를 담아보세요."
    },

    gallery: {
      pickerLabel: "초대장 템플릿 선택",
      occasionQuestion: "어떤 날인가요?",
      occasionListLabel: "행사 유형",
      designLabel: "디자인 선택",
      designListLabel: "템플릿 디자인",
      showAll: "전체 보기",
      showAllCount: "{count}개 전체 보기",
      collapse: "접기",
      apply: "이 디자인으로 만들기",
      continueToEditor: "내용 편집하기",
      undo: "되돌리기",
      start: "이 디자인으로 시작",
      startNamed: "{name}로 시작",
      keepDraft: "현재 초안 유지",
      applied: "적용됨",
      selectTemplate: "{name} 템플릿 선택",
      selectTemplateApplied: ", 현재 적용됨",
      summaryApplied: "적용된 디자인: {name}",
      summaryPending: "선택: {name} · 적용 전까지 현재 초안은 유지됩니다.",
      summaryEmpty: "적용할 템플릿을 선택해 주세요.",
      dockLabel: "선택한 디자인",
      dockSelected: "선택한 디자인 · {name}",
      dockEmpty: "디자인을 선택해 주세요",
      dockBack: "디자인 목록",
      applyFailed: "템플릿을 적용하지 못했습니다. 현재 초안은 그대로 유지됩니다."
    },

    editor: {
      detailsTitle: "기본 정보",
      detailsHint: "제목 · 일정 · 메시지",
      title: "제목",
      subtitle: "부제",
      dateLabel: "일시",
      host: "보내는 사람",
      message: "메시지",

      locationTitle: "대표 장소",
      locationHint: "장소 · 네이버 지도",
      location: "장소 또는 주소",
      mapUrl: "지도 링크",
      mapEnabled: "대표 동적 지도 표시",

      styleTitle: "스타일과 효과",
      styleHint: "인트로 · 파티클 · 폰트",
      introEffect: "인트로 효과",
      replayIntro: "인트로 다시 보기",
      particleEffect: "파티클 효과",
      particleScale: "파티클 크기",
      particleScaleLabel: "파티클 크기 스케일",
      particleScaleValue: "파티클 크기 {value}",
      particleAmount: "파티클 양",
      particleAmountLabel: "파티클 양 스케일",
      particleAmountValue: "파티클 양 {value}",
      englishFont: "영문 폰트",
      koreanFont: "한글 폰트",

      heroTitle: "첫 화면 배경",
      heroHint: "사진 · 위치 · 확대",

      contentTitle: "초대장 항목",
      contentHint: "↑ ↓ 로 순서 변경",

      reviewButton: "완성 미리보기"
    },

    effects: {
      introNone: "사용 안 함",
      introGroupClassic: "클래식",
      introEnvelope: "봉투 열기",
      introCardShrink: "전체 화면 카드",
      introGroupCinematic: "시네마틱",
      introDawn: "어둠에서 밝아지기",
      introCurtain: "커튼 열기",
      introSpotlight: "스포트라이트",
      introGroupCelebration: "축하",
      introFireworks: "골드 폭죽",
      introGroupRomantic: "로맨틱",
      introPetals: "꽃잎 사이로",
      introGroupPhoto: "사진",
      introPhotoFocus: "사진 초점 전환",

      particleNone: "효과 없음",
      particleGroupRomantic: "로맨틱",
      particlePetals: "꽃잎",
      particleHearts: "하트",
      particleGroupMood: "분위기",
      particleSparkle: "빛가루",
      particleFireflies: "반딧불",
      particleBubbles: "버블",
      particleGroupSeason: "계절",
      particleSnow: "눈",
      particleLeaves: "나뭇잎",
      particleGroupCelebration: "축하",
      particleConfetti: "컨페티"
    },

    fonts: {
      gowunBatang: "고운바탕",
      notoSerifKr: "노토 명조",
      nanumMyeongjo: "나눔명조",
      nanumGothic: "나눔고딕",
      songMyung: "송명"
    },

    hero: {
      frameLabel: "첫 화면 배경 사진 위치 조정",
      empty: "템플릿 기본 배경",
      add: "배경 사진 추가",
      change: "사진 변경",
      scale: "확대",
      scaleLabel: "배경 사진 확대",
      scaleValue: "배경 사진 확대 {value}",
      reset: "초기화",
      resetTitle: "배경 사진 위치 초기화",
      remove: "삭제",
      removeTitle: "배경 사진 삭제",
      fileLabel: "첫 화면 배경 사진 파일 선택",
      processing: "{file}: 배경 사진을 처리하고 있습니다.",
      added: "{file}: 배경 사진을 추가했습니다.",
      wasReset: "배경 사진 위치와 확대를 초기화했습니다.",
      wasRemoved: "템플릿 기본 배경으로 되돌렸습니다."
    },

    content: {
      sectionLabel: "초대장 항목",
      photoFileLabel: "초대장 사진 파일 선택",
      addCourse: "+ 코스",
      addPhoto: "+ 사진",
      addNotice: "+ 안내",
      addProfile: "+ 인물 소개",
      addLink: "+ 연락처·링크",
      empty: "코스나 사진을 추가해 초대장을 구성하세요.",
      limitReached: "초대장 항목은 최대 {max}개까지 추가할 수 있습니다.",

      typeCourse: "코스",
      typePhoto: "사진",
      typeNotice: "안내",
      typeProfile: "인물 소개",
      typeLink: "연락처·링크",

      moveUp: "{type} 항목 위로 이동",
      moveUpTitle: "위로 이동",
      moveDown: "{type} 항목 아래로 이동",
      moveDownTitle: "아래로 이동",
      removeItem: "{type} 항목 삭제",
      removeItemTitle: "이 항목 삭제",
      confirmRemove: "“{name}” 항목을 삭제할까요?",

      fallbackCourse: "코스 {index}",
      fallbackPhoto: "사진 {index}",
      fallbackNotice: "안내 {index}",
      fallbackProfile: "인물 소개 {index}",
      fallbackLink: "연락처·링크 {index}",

      summaryCourse: "장소를 입력하세요",
      summaryPhoto: "설명을 입력하세요",
      summaryNotice: "안내 내용을 입력하세요",
      summaryProfile: "소개할 인물을 입력하세요",
      summaryLink: "연락처나 링크를 입력하세요",
      timeUnset: "시간 미정",

      courseTime: "시간",
      courseLabel: "라벨",
      courseLabelSelect: "코스 라벨",
      courseLabelCustom: "직접 입력",
      courseLabelPlaceholder: "예: EXHIBITION",
      coursePlace: "장소 또는 주소",
      courseNote: "메모",
      courseMapUrl: "지도 링크",
      courseMapEnabled: "이 코스에 동적 지도 표시",

      photoThumbnailAlt: "선택한 사진 미리보기",
      photoAlt: "대체 텍스트",
      photoCaption: "사진 설명",
      photoProcessing: "{file}: 사진을 처리하고 있습니다.",
      photoAdded: "{file}: 사진을 추가했습니다.",
      photoFailed: "{file}: {reason}",
      photoOverCapacity: "{file}: 선택 시점의 추가 가능 수를 초과해 처리하지 않았습니다.",
      photoSkipped: "{file}: 사진 처리를 완료했지만 {limit} 제한으로 추가하지 않았습니다.",
      limitItems: "초대장 항목",
      limitPhotos: "사진",
      imageFailed: "이미지를 처리할 수 없습니다.",

      noticeHeading: "제목",
      noticeBody: "내용",
      profileName: "이름",
      profileRole: "역할",
      profileDescription: "소개",
      linkLabel: "라벨",
      linkValue: "표시값",
      linkUrl: "URL"
    },

    map: {
      loading: "지도를 불러오는 중입니다.",
      searching: "지도 위치를 찾고 있습니다.",
      ready: "지도 위치를 확인했습니다.",
      empty: "장소 또는 주소를 입력해 주세요.",
      pending: "장소 입력을 마치면 지도 위치를 확인합니다.",
      notFound: "장소를 찾지 못했습니다. 도로명 주소를 입력해 주세요.",
      serviceUnavailable: "지도 위치 검색을 사용할 수 없습니다. NAVER Geocoding 설정을 확인해 주세요.",
      unavailable: "지도를 불러올 수 없습니다. 아래 버튼으로 확인하세요.",
      retry: "지도 다시 시도"
    },

    preview: {
      eyebrow: "Preview",
      heading: "미리보기",
      frameTitle: "초대장 미리보기",
      apply: "선택한 디자인 적용",
      pendingTemplate: "현재 초안 미리보기입니다. 선택한 ‘{name}’ 디자인은 아직 적용 전입니다.",
      sample: "디자인 샘플 · 작성한 내용은 유지됩니다"
    },

    finish: {
      persistenceLead: "보관함은 이 브라우저에만 저장돼요.",
      persistenceBody: "브라우저 데이터를 지우거나 시크릿(프라이빗) 모드를 쓰면 보관함의 초안이 함께 사라져요. 오래 보관하고 싶다면 아래에서 파일로 저장하거나 링크를 만들어 두세요.",
      saveTitle: "보관함에 저장",
      saveDesc: "이 브라우저의 보관함에 넣어 두고 이어서 고쳐요.",
      downloadTitle: "파일로 저장",
      downloadDesc: "사진이 담긴 HTML 파일 하나로 내려받아요.",
      shareTitle: "링크로 공유",
      shareDesc: "누구나 열어볼 수 있는 공개 페이지를 만들어요.",
      close: "닫기",
      downloadDialogLead: "사진까지 하나로 묶은 HTML 파일을 내려받아요.",
      downloadDialogStrong: "이 파일이 끝까지 남는 사본",
      downloadDialogTail: "이에요 — 브라우저 보관함과 달리 기기를 바꾸거나 저장 공간을 지워도 파일만 있으면 언제든 다시 열 수 있어요.",
      downloadButton: "HTML 다운로드",
      shareDialogLead: "공개 링크는 서버에 보관되어 이 브라우저를 지워도 계속 열려요. 다만",
      shareDialogStrong: "링크를 취소(폐기)할 수 있는 권한은 이 브라우저에만",
      shareDialogTail: "저장되니, 나중에 링크를 내리려면 지금 이 브라우저로 다시 들어와야 해요.",
      shareDialogPanelLabel: "공개 링크 발행",
      confirmReplyContact: "회신을 요청하는 항목에 연락처나 링크가 없습니다. 연락 수단 없이 다운로드할까요?\n취소하면 연락처 입력으로 이동합니다.",
      /* Matched against the label and value the AUTHOR typed, to notice an
         RSVP item with no way to reply. Locale-specific because an English
         author writes "RSVP" or "Reply", not "회신". Source string rather
         than a literal so each language contributes its own vocabulary. */
      replyContactPattern: "rsvp|회신|참석|연락"
    },

    library: {
      eyebrow: "Library",
      heading: "나의 초대장",
      uploadLabel: "다운로드된 HTML 등록",
      empty: "아직 등록된 초대장이 없습니다.",
      sourceUpload: "HTML 등록",
      sourceGenerated: "직접 제작",
      open: "열기",
      download: "다운로드",
      remove: "삭제",
      confirmRemove: "“{title}” 초대장을 목록에서 삭제할까요?",
      untitled: "Untitled Invitation",
      unknownDate: "날짜 정보 없음"
    },

    status: {
      draftKept: "이 기기에 초안을 보관합니다",
      draftSaving: "초안 저장 중…",
      draftSaved: "이 기기에 초안 저장됨",
      draftFailed: "자동 저장 실패 · HTML로 다운로드해 주세요",
      draftRestored: "이전 초안을 복구했습니다",
      draftUnavailable: "자동 저장 사용 불가 · HTML로 다운로드해 주세요",

      saved: "목록에 등록했습니다.",
      savedUnsynchronized: "등록은 완료했지만 저장 목록 정리를 마치지 못했습니다.",
      saveFailed: "브라우저 저장 공간에 기록하지 못해 등록에 실패했습니다.",

      uploaded: "초대장을 등록했습니다.",
      uploadedUnsynchronized: "등록은 완료했지만 저장 목록 정리를 마치지 못했습니다.",
      uploadTooLarge: "10MB 이하의 초대장 HTML만 등록할 수 있습니다.",
      uploadUnsupported: "이 제작기에서 다운로드한 HTML만 등록할 수 있습니다.",

      removed: "등록된 초대장을 삭제했습니다.",
      removedUnsynchronized: "삭제는 완료했지만 저장 목록 새로고침을 마치지 못했습니다.",
      removeFailed: "브라우저 저장 공간을 변경하지 못했습니다.",

      storageUnavailable: "등록 목록 저장소를 열지 못했습니다. 제작과 다운로드는 계속 사용할 수 있습니다.",
      migrationUnavailable: "기존 등록 목록 마이그레이션을 시작하지 못했습니다. 기존 데이터는 그대로 유지됩니다.",
      syncIncomplete: "등록 목록 동기화를 마치지 못했습니다. 제작과 다운로드는 계속 사용할 수 있습니다.",
      syncFailed: "등록 목록 동기화에 실패했습니다. 제작과 다운로드는 계속 사용할 수 있습니다.",

      bootFailedTitle: "초기 데이터를 불러오지 못했습니다.",
      bootFailedBody: "별도 JSON 파일을 읽기 때문에 로컬 서버나 배포 환경에서 열어야 합니다."
    }
  };
});
