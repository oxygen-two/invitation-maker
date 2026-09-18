/* Korean copy for the landing page and the user guide.

   Kept apart from dictionary-ko.js so the studio never ships a page's worth
   of marketing and FAQ text it cannot display. The engine's register()
   replaces a language's dictionary wholesale, so this file re-registers the
   main dictionary with the `site` namespace merged on top. Load order:
   i18n.js → dictionary-ko.js → dictionary-en.js → this file → the English one. */
(function exposeSiteDictionaryKo(root, factory) {
  const dictionary = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = dictionary;
  }

  root.InvitationI18n?.register("ko", { ...(root.InvitationDictionaryKo || {}), ...dictionary });
  root.InvitationSiteDictionaryKo = dictionary;
})(typeof globalThis === "object" ? globalThis : this, function createSiteDictionaryKo() {
  return {
    site: {
      meta: {
        landingTitle: "Invitation Studio · 작은 초대, 소중한 순간",
        landingDescription: "회원가입 없이 디자인을 고르고 내용을 채워, 파일이나 링크로 보내는 무료 모바일 초대장.",
        guideTitle: "사용법 · Invitation Studio",
        guideDescription: "디자인 고르기, 내용 채우기, 완성 방식 세 가지, 내 데이터가 저장되는 곳까지 한 페이지에.",
        privacyTitle: "개인정보처리방침 · Invitation Studio",
        privacyDescription: "무엇이 브라우저에 남고 무엇이 서버에 저장되는지, 공개 링크는 언제 만료되는지, 통계와 오류 진단은 어떻게 다루는지 정리했습니다.",
        termsTitle: "이용약관 · Invitation Studio",
        termsDescription: "회원가입 없는 초대장 제작 서비스의 이용 조건, 올린 내용에 대한 책임, 공개 링크의 수명을 정리했습니다."
      },
      header: {
        tagline: "작은 날도, 특별하게.",
        guide: "사용법",
        cta: "초대장 만들기",
        skip: "본문으로 건너뛰기",
        langLabel: "언어 선택",
        langDescription: "표시 언어",
        navLabel: "사이트"
      },
      footer: {
        brand: "INVITATION STUDIO",
        about: "소개",
        guide: "사용법",
        data: "내 데이터",
        privacy: "개인정보처리방침",
        terms: "이용약관",
        note: "작은 초대, 소중한 순간.",
        navLabel: "바닥글 링크"
      },
      landing: {
        hero: {
          eyebrow: "회원가입 없음 · 무료",
          title: "작은 초대, 소중한 순간.",
          lead: "디자인을 고르고, 내용을 채우고, 파일이나 링크로 보내세요.",
          cta: "초대장 만들기",
          sample: "완성된 초대장 먼저 보기",
          imageAlt: "휴대폰 화면에 열린 완성 초대장 예시"
        },
        steps: {
          eyebrow: "HOW IT WORKS",
          title: "세 단계면 됩니다",
          one: { title: "디자인 고르기", text: "생일, 결혼, 돌잔치, 모임. 행사에 맞는 디자인을 고르면 샘플이 바로 보입니다." },
          two: { title: "내용 채우기", text: "제목, 일정, 장소, 메시지를 적고 사진을 더하세요. 미리보기는 하객이 받는 화면 그대로입니다." },
          three: { title: "보관 · 파일 · 링크", text: "이 브라우저에 보관하거나, 파일 하나로 내려받거나, 공개 링크로 보내세요." }
        },
        gallery: {
          eyebrow: "DESIGNS",
          title: "디자인",
          lead: "취향으로 고르세요. 행사 유형마다 여러 디자인이 있습니다.",
          cta: "디자인 전체 보기",
          stripLabel: "디자인 목록",
          bloomPortrait: "생일",
          wedding: "결혼",
          firstChapter: "돌잔치",
          goldenYears: "환갑",
          botanical: "데이트",
          midnightCinema: "행사"
        },
        trust: {
          eyebrow: "PEACE OF MIND",
          title: "안심하고 쓰세요",
          one: { title: "회원가입도 앱 설치도 없습니다", text: "브라우저에서 열어 바로 만듭니다. 이메일도 전화번호도 묻지 않습니다." },
          two: { title: "초안은 내 브라우저에만 남습니다", text: "쓰는 동안 자동으로 저장되지만, 서버로 보내지 않습니다." },
          three: { title: "파일은 영원히, 링크는 내가 정합니다", text: "파일로 받으면 계속 내 것입니다. 공개 링크는 시간이 지나면 만료되고, 원할 때 취소할 수 있습니다." },
          link: "내 데이터는 어디에 저장되나요"
        },
        closing: {
          eyebrow: "READY?",
          title: "지금 만들어 보세요",
          cta: "초대장 만들기"
        }
      },
      guide: {
        title: "사용법",
        lead: "디자인을 고르고, 내용을 채우고, 원하는 방식으로 전하면 됩니다.",
        toc: { steps: "세 단계", finish: "완성 방식 세 가지", data: "내 데이터는 어디에", faq: "자주 묻는 질문" },
        steps: {
          eyebrow: "STEP BY STEP",
          title: "세 단계",
          one: {
            title: "디자인",
            text: "먼저 행사 유형을 고르고, 마음에 드는 디자인 카드를 누르면 샘플이 크게 보입니다. 마음에 들면 '이 디자인으로 만들기'를 누르세요. 나중에 디자인을 바꿔도 이미 쓴 내용은 그대로 남습니다.",
            alt: "스튜디오의 디자인 선택 화면"
          },
          two: {
            title: "내용 편집",
            text: "제목, 일정, 메시지 같은 기본 정보를 먼저 채우세요. 장소와 지도 링크는 그 아래에 있고, 사진과 효과는 접혀 있는 항목을 열면 나옵니다. 오른쪽 미리보기는 하객이 받는 문서와 정확히 같습니다.",
            alt: "스튜디오의 내용 편집 화면"
          },
          three: {
            title: "완성",
            text: "세 가지 방식 중 하나를 고릅니다. 초안은 쓰는 동안 이 브라우저에 자동 저장되니, 완성 화면에 오기 전에 닫아도 이어서 만들 수 있습니다.",
            alt: "스튜디오의 완성 화면"
          }
        },
        finish: {
          eyebrow: "FINISHING",
          title: "완성 방식 세 가지",
          lead: "셋 중 무엇을 골라도 되고, 여러 개를 함께 써도 됩니다. 차이는 어디에 남느냐입니다.",
          tableLabel: "완성 방식 비교 표",
          head: { method: "방식", where: "남는 곳", switch: "브라우저를 바꾸면", undo: "되돌리기" },
          library: { method: "보관함에 저장", where: "이 브라우저", switch: "사라짐", undo: "목록에서 삭제" },
          file: { method: "파일로 저장", where: "내 기기의 HTML 파일", switch: "파일은 그대로", undo: "파일 삭제" },
          link: { method: "링크로 공유", where: "서버", switch: "링크는 살아 있고, 취소 권한은 이 브라우저에만", undo: "스튜디오에서 취소" },
          fileTitle: "HTML 파일은 어떻게 쓰나요",
          fileText: "사진까지 하나로 담긴 파일이라 어떤 브라우저에서든 열립니다. 메신저나 메일에 파일로 첨부해도 되고, 나중에 보관함에 다시 불러와 고칠 수도 있습니다."
        },
        data: {
          eyebrow: "YOUR DATA",
          title: "내 데이터는 어디에",
          one: "초안과 보관함은 이 브라우저의 저장소에만 있습니다. 서버로 보내지 않습니다.",
          two: "공개 링크만 서버에 저장됩니다. 마지막으로 열린 뒤 7일이 지나면 만료되고, 아무리 자주 열려도 발행 후 30일이 지나면 만료됩니다. 만료된 링크는 열리지 않습니다.",
          three: "링크 취소는 발행한 브라우저의 스튜디오에서만 할 수 있습니다. 그 브라우저를 잃었다면 만료를 기다리는 수밖에 없습니다.",
          four: "공개 링크는 검색엔진에 색인되지 않습니다.",
          five: "방문 통계 도구를 씁니다. 브라우저의 추적 거부 설정을 존중하고, 초대장 내용은 통계로 보내지 않습니다.",
          six: "초대장을 받은 분이 자기 정보가 담긴 링크를 지우고 싶다면, 보낸 분에게 취소를 요청해 주세요.",
          seven: "브라우저 저장소를 지우면 초안과 보관함도 함께 사라집니다. 지우기 전에 파일로 내려받아 두세요."
        },
        faq: {
          eyebrow: "QUESTIONS",
          title: "자주 묻는 질문",
          q1: "사진은 몇 장까지 넣을 수 있나요?",
          a1: "링크로 공유할 때는 초대장 전체가 2MB 안에 들어가야 합니다. 보통 사진 서너 장 정도입니다. 파일로 저장할 때는 제한이 없습니다.",
          q2: "사진이 안 올라가요.",
          a2: "너무 큰 사진이거나 지원하지 않는 형식일 수 있습니다. 휴대폰에서 찍은 JPG, PNG는 대부분 됩니다. 다른 사진으로 다시 시도해 보세요.",
          q3: "디자인을 바꾸면 쓴 내용이 사라지나요?",
          a3: "아니요. 제목, 일정, 사진, 항목 순서는 그대로 남고 디자인만 바뀝니다. 마음에 안 들면 되돌리기를 누르세요.",
          q4: "지도 링크는 어떤 걸 넣나요?",
          a4: "지도 앱에서 장소를 찾은 뒤 '공유'로 복사한 링크를 붙여 넣으세요. 링크가 없으면 하객은 장소 이름으로 지도를 검색하게 됩니다.",
          q5: "초대장 언어와 화면 언어는 다른가요?",
          a5: "네. 화면 언어는 이 도구의 메뉴와 안내에만 적용됩니다. 초대장에 쓴 내용은 쓴 그대로 하객에게 보입니다.",
          q6: "여러 개 만들 수 있나요?",
          a6: "네. 보관함에 여러 초대장을 저장하고 골라서 이어 만들 수 있습니다.",
          q7: "다른 기기에서 이어서 만들 수 있나요?",
          a7: "파일로 저장해 다른 기기로 옮긴 뒤, 그 기기의 보관함에 불러오세요. 초안은 브라우저마다 따로 있어 자동으로 옮겨지지 않습니다.",
          q8: "만료된 링크를 다시 살릴 수 있나요?",
          a8: "아니요. 보관함이나 파일에서 초대장을 열어 새 링크로 다시 발행하세요."
        },
        closing: {
          eyebrow: "READY?",
          title: "이제 만들어 볼까요",
          cta: "초대장 만들기"
        }
      },
      /* The two legal pages. Full drafts: `[OPERATOR]` and `[CONTACT_EMAIL]`
         are placeholders and must be replaced with the real operator name and
         address before this is deployed to the public. The retention numbers
         repeat the shipped defaults from docs/publishing.md and are checked
         against server/config/publishing.cjs by tests/site-pages.test.js. */
      privacy: {
        title: "개인정보처리방침",
        lead: "회원가입이 없는 서비스입니다. 이름도 이메일도 묻지 않습니다. 그래도 초대장을 만들고 보내는 동안 데이터가 어디에 남는지는 분명히 밝혀 두어야 합니다.",
        updated: "마지막 수정: 2026년 9월 18일",
        toc: {
          browser: "브라우저에 남는 것",
          server: "서버에 저장되는 것",
          retention: "공개 링크의 보관 기간",
          analytics: "방문 통계",
          diagnostics: "오류 진단",
          deletion: "삭제 요청",
          children: "어린이 정보",
          contact: "문의"
        },
        browser: {
          eyebrow: "01",
          title: "브라우저에 남는 것",
          lead: "아래 항목은 이 브라우저의 저장소에만 있습니다. 어느 것도 서버로 보내지 않고, 다른 기기에서는 보이지 않습니다. 이 브라우저를 떠나는 저장값은 아래 방문 통계에 적은 분석 식별자 하나뿐이고, 그것도 동의한 뒤에만 보냅니다.",
          one: "작성 중인 초안. 쓰는 동안 자동으로 저장됩니다.",
          two: "보관함에 저장한 초대장. 제목, 일정, 장소, 메시지, 사진이 모두 이 브라우저 안에 있습니다.",
          three: "공개 링크를 취소할 수 있는 관리 토큰. 링크를 발행한 브라우저에만 저장되고, 링크 주소에는 들어가지 않습니다.",
          four: "표시 언어와 이 페이지에서 고른 통계 동의 여부.",
          note: "브라우저 저장소를 지우면 위 항목이 모두 사라집니다. 이미 발행한 공개 링크는 그대로 남지만, 그 링크를 취소할 방법은 함께 사라집니다."
        },
        server: {
          eyebrow: "02",
          title: "서버에 저장되는 것",
          lead: "링크로 공유를 눌렀을 때만 초대장 사본 하나가 서버에 저장됩니다. 저장되는 항목은 그 초대장에 직접 적은 내용입니다.",
          one: "제목과 안내 문구",
          two: "초대장에 적은 사람 이름",
          three: "날짜와 시간",
          four: "장소 이름, 주소, 지도 링크",
          five: "연락처 항목에 적은 전화번호나 링크",
          six: "올린 사진. 별도 파일이 아니라 문서 안에 data URI로 함께 저장됩니다.",
          note: "링크를 아는 사람은 누구나 초대장을 볼 수 있습니다. 검색엔진에 색인되지는 않지만 비밀번호로 보호되지도 않습니다. 하객 모두가 봐도 괜찮은 내용만 적어 주세요."
        },
        retention: {
          eyebrow: "03",
          title: "공개 링크의 보관 기간",
          lead: "공개 링크는 열릴 때 수명이 밀리는 방식으로 만료됩니다.",
          one: "발행하면 7일 뒤에 만료되도록 표시됩니다.",
          two: "누군가 링크를 열면 만료 시점이 그때로부터 7일 뒤로 밀립니다. 이 갱신은 6시간에 한 번까지만 일어나므로, 짧은 시간에 여러 번 열려도 한 번으로 셉니다.",
          three: "아무리 자주 열려도 발행일로부터 30일을 넘기지 않습니다.",
          note: "7일과 30일은 현재 운영 기본값이며 운영자가 바꿀 수 있습니다. 만료된 링크는 더 이상 열리지 않습니다."
        },
        analytics: {
          eyebrow: "04",
          title: "방문 통계",
          lead: "통계 도구는 동의를 누른 뒤에만 불러옵니다. 처음 방문했을 때 화면 아래에 뜨는 배너에서 필수만 사용을 고르면 통계 스크립트는 아예 실행되지 않습니다.",
          one: "쓰는 도구는 Google Analytics 4, PostHog, Vercel Web Analytics입니다.",
          two: "보내는 값은 미리 정한 목록뿐입니다. 어떤 화면을 봤는지, 어떤 디자인을 골랐는지, 저장이나 다운로드를 했는지 같은 것들입니다.",
          three: "초대장에 쓴 제목, 이름, 연락처, 사진, 장소는 보내지 않습니다. 공개 링크 주소와 관리 토큰도 보내지 않습니다.",
          four: "브라우저의 추적 거부(DNT)나 Global Privacy Control이 켜져 있으면 동의와 상관없이 통계는 꺼집니다.",
          five: "방문 단위 식별자(flow_id)를 만들어 이 브라우저의 저장소에 보관합니다. 흩어진 이벤트를 한 번의 방문으로 읽기 위한 무작위 값이고 이름이나 계정과 연결되지 않으며, 동의한 뒤 제품 이벤트와 함께만 전송됩니다. Google Analytics 4와 PostHog은 불러온 뒤 각자의 쿠키나 저장소를 따로 설정합니다.",
          settings: "쿠키 · 분석 설정 다시 열기"
        },
        diagnostics: {
          eyebrow: "05",
          title: "오류 진단",
          lead: "화면이 깨졌을 때 원인을 찾기 위한 진단 기록은 동의와 상관없이 보냅니다. 서비스를 정상적으로 제공하는 데 필요한 최소한의 기록으로 보기 때문입니다.",
          one: "보내는 값은 미리 정한 오류 종류, 오류가 난 스크립트 파일 이름과 줄 번호, 브라우저 종류와 운영체제 정도입니다.",
          two: "오류 메시지 원문, 페이지 주소, 초대장 내용은 보내지 않습니다. 한 페이지에서 최대 여덟 건까지만 기록합니다."
        },
        deletion: {
          eyebrow: "06",
          title: "삭제 요청",
          lead: "서버에 남는 것은 공개 링크 하나뿐이라, 지우는 방법도 간단합니다.",
          one: "링크를 발행한 브라우저에서 스튜디오를 열고 링크를 취소하면 서버 사본이 바로 지워집니다.",
          two: "그 브라우저를 잃었거나 초대장을 받은 쪽이라면 [CONTACT_EMAIL]로 링크 주소와 함께 삭제를 요청해 주세요. 확인한 뒤 지워 드립니다.",
          three: "이미 내려받은 HTML 파일이나 화면 캡처는 회수할 수 없습니다.",
          note: "브라우저에만 있는 초안과 보관함은 저희가 지울 수 없습니다. 보관함 목록에서 직접 삭제하시면 됩니다."
        },
        children: {
          eyebrow: "07",
          title: "어린이 정보",
          lead: "이 서비스는 어린이를 대상으로 하지 않으며, 만드는 사람의 나이를 묻거나 수집하지 않습니다.",
          one: "돌잔치나 유치원 초대장처럼 어린이의 이름과 사진이 들어가는 경우, 그 정보를 올릴지 정하는 것은 초대장을 만드는 보호자입니다.",
          two: "어린이 정보가 담긴 링크를 지우고 싶다면 위의 삭제 요청 방법을 따라 주세요."
        },
        contact: {
          eyebrow: "08",
          title: "문의",
          lead: "이 서비스의 운영자는 [OPERATOR]입니다. 개인정보에 관한 문의나 삭제 요청은 [CONTACT_EMAIL]로 보내 주세요.",
          note: "이 방침이 바뀌면 이 페이지 위쪽의 수정 날짜도 함께 바뀝니다."
        }
      },
      terms: {
        title: "이용약관",
        lead: "짧게 정리했습니다. 이 서비스를 쓰면 아래 내용에 동의하는 것으로 봅니다.",
        updated: "마지막 수정: 2026년 9월 18일",
        toc: {
          service: "어떤 서비스인가요",
          account: "계정이 없습니다",
          content: "올린 내용에 대한 책임",
          prohibited: "올리면 안 되는 것",
          availability: "서비스 제공과 보증",
          expiry: "공개 링크의 수명",
          contact: "문의와 약관 변경"
        },
        service: {
          eyebrow: "01",
          title: "어떤 서비스인가요",
          lead: "브라우저에서 모바일 초대장을 만들어 파일로 내려받거나 공개 링크로 공유하는 무료 도구입니다.",
          one: "초대장은 브라우저 안에서 만들어집니다. 보관함에 저장하거나 HTML 파일로 내려받는 동안 서버는 관여하지 않습니다.",
          two: "링크로 공유를 눌렀을 때만 초대장 사본이 서버에 저장되고 공개 주소가 만들어집니다."
        },
        account: {
          eyebrow: "02",
          title: "계정이 없습니다",
          lead: "회원가입도 로그인도 없습니다. 편리한 만큼 한계도 분명합니다.",
          one: "이 브라우저가 곧 신원입니다. 브라우저 저장소를 지우면 초안, 보관함, 링크 취소 권한을 되찾을 방법이 없습니다.",
          two: "계정 복구 절차가 없으니, 오래 남길 초대장은 HTML 파일로 내려받아 두세요."
        },
        content: {
          eyebrow: "03",
          title: "올린 내용에 대한 책임",
          lead: "초대장에 들어가는 내용은 만든 사람의 것이고, 책임도 만든 사람에게 있습니다.",
          one: "다른 사람의 이름, 사진, 전화번호를 초대장에 넣어 공개 링크로 공유하려면 그렇게 할 권리가 있어야 합니다. 사진 속 인물과 연락처의 주인에게 미리 동의를 받아 주세요.",
          two: "공개 링크는 주소를 아는 사람이라면 누구나 열 수 있습니다. 비밀번호가 없으니 공개해도 괜찮은 내용만 담아 주세요.",
          three: "쓰려는 사진, 글꼴, 그림에 대한 권리가 있는지도 확인해 주세요.",
          four: "저희는 발행되는 내용을 미리 검토하지 않습니다. 신고가 들어오면 확인 후 링크를 내릴 수 있습니다."
        },
        prohibited: {
          eyebrow: "04",
          title: "올리면 안 되는 것",
          lead: "다음에 해당하는 내용은 발행할 수 없습니다. 발견되면 예고 없이 링크를 내립니다.",
          one: "다른 사람의 개인정보를 동의 없이 공개하는 내용",
          two: "불법이거나 혐오, 괴롭힘, 협박에 해당하는 내용",
          three: "성인물이나 아동 착취물",
          four: "사기, 피싱, 악성코드 배포를 위한 링크",
          five: "다른 사람의 저작권이나 상표권을 침해하는 내용",
          six: "자동화된 대량 발행처럼 서비스 운영을 방해하는 행위"
        },
        availability: {
          eyebrow: "05",
          title: "서비스 제공과 보증",
          lead: "이 서비스는 무료로, 있는 그대로 제공됩니다.",
          one: "점검이나 장애로 언제든 멈출 수 있고, 기능이 바뀌거나 없어질 수 있습니다.",
          two: "발행 건수에는 운영상 한도가 있습니다. 한도에 닿으면 새 링크를 만들 수 없습니다.",
          three: "데이터가 사라지거나 링크가 열리지 않아 생긴 손해에 대해서는 법이 허용하는 범위에서 책임지지 않습니다. 중요한 초대장은 HTML 파일로도 내려받아 두세요."
        },
        expiry: {
          eyebrow: "06",
          title: "공개 링크의 수명",
          lead: "공개 링크는 영구 보관이 아닙니다.",
          one: "마지막으로 열린 뒤 7일이 지나면 만료됩니다. 링크가 열리면 이 기간이 다시 밀리고, 갱신은 6시간에 한 번까지만 일어납니다.",
          two: "아무리 자주 열려도 발행일로부터 30일이 지나면 만료됩니다.",
          three: "7일과 30일은 현재 운영 기본값이며 운영자가 바꿀 수 있습니다. 만료되거나 취소된 링크는 되살릴 수 없고, 초대장을 다시 열어 새 링크를 발행해야 합니다."
        },
        contact: {
          eyebrow: "07",
          title: "문의와 약관 변경",
          lead: "이 서비스의 운영자는 [OPERATOR]입니다. 약관과 관련한 문의, 신고, 삭제 요청은 [CONTACT_EMAIL]로 보내 주세요.",
          note: "약관이 바뀌면 이 페이지 위쪽의 수정 날짜도 함께 바뀝니다. 변경 후에도 서비스를 계속 쓰면 바뀐 약관에 동의한 것으로 봅니다."
        }
      }
    }
  };
});
