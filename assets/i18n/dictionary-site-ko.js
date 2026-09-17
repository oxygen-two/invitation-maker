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
        guideDescription: "디자인 고르기, 내용 채우기, 완성 방식 세 가지, 내 데이터가 저장되는 곳까지 한 페이지에."
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
          title: "세 단계면 됩니다",
          one: { title: "01 디자인 고르기", text: "생일, 결혼, 돌잔치, 모임. 행사에 맞는 디자인을 고르면 샘플이 바로 보입니다." },
          two: { title: "02 내용 채우기", text: "제목, 일정, 장소, 메시지를 적고 사진을 더하세요. 미리보기는 하객이 받는 화면 그대로입니다." },
          three: { title: "03 보관 · 파일 · 링크", text: "이 브라우저에 보관하거나, 파일 하나로 내려받거나, 공개 링크로 보내세요." }
        },
        gallery: {
          title: "디자인",
          lead: "취향으로 고르세요. 행사 유형마다 여러 디자인이 있습니다.",
          cta: "디자인 전체 보기",
          bloomPortrait: "생일",
          wedding: "결혼",
          firstChapter: "돌잔치",
          goldenYears: "환갑",
          botanical: "데이트",
          midnightCinema: "행사",
          altPrefix: "초대장 디자인 예시"
        },
        trust: {
          title: "안심하고 쓰세요",
          one: { title: "회원가입도 앱 설치도 없습니다", text: "브라우저에서 열어 바로 만듭니다. 이메일도 전화번호도 묻지 않습니다." },
          two: { title: "초안은 내 브라우저에만 남습니다", text: "쓰는 동안 자동으로 저장되지만, 서버로 보내지 않습니다." },
          three: { title: "파일은 영원히, 링크는 내가 정합니다", text: "파일로 받으면 계속 내 것입니다. 공개 링크는 시간이 지나면 만료되고, 원할 때 취소할 수 있습니다." },
          link: "내 데이터는 어디에 저장되나요"
        },
        closing: {
          title: "지금 만들어 보세요",
          cta: "초대장 만들기"
        }
      },
      guide: {
        title: "사용법",
        lead: "디자인을 고르고, 내용을 채우고, 원하는 방식으로 전하면 됩니다.",
        toc: { steps: "세 단계", finish: "완성 방식 세 가지", data: "내 데이터는 어디에", faq: "자주 묻는 질문" },
        steps: {
          title: "세 단계",
          one: {
            title: "01 디자인",
            text: "먼저 행사 유형을 고르고, 마음에 드는 디자인 카드를 누르면 샘플이 크게 보입니다. 마음에 들면 '이 디자인으로 만들기'를 누르세요. 나중에 디자인을 바꿔도 이미 쓴 내용은 그대로 남습니다.",
            alt: "스튜디오의 디자인 선택 화면"
          },
          two: {
            title: "02 내용 편집",
            text: "제목, 일정, 메시지 같은 기본 정보를 먼저 채우세요. 장소와 지도 링크는 그 아래에 있고, 사진과 효과는 접혀 있는 항목을 열면 나옵니다. 오른쪽 미리보기는 하객이 받는 문서와 정확히 같습니다.",
            alt: "스튜디오의 내용 편집 화면"
          },
          three: {
            title: "03 완성",
            text: "세 가지 방식 중 하나를 고릅니다. 초안은 쓰는 동안 이 브라우저에 자동 저장되니, 완성 화면에 오기 전에 닫아도 이어서 만들 수 있습니다.",
            alt: "스튜디오의 완성 화면"
          }
        },
        finish: {
          title: "완성 방식 세 가지",
          lead: "셋 중 무엇을 골라도 되고, 여러 개를 함께 써도 됩니다. 차이는 어디에 남느냐입니다.",
          head: { method: "방식", where: "남는 곳", switch: "브라우저를 바꾸면", undo: "되돌리기" },
          library: { method: "보관함에 저장", where: "이 브라우저", switch: "사라짐", undo: "목록에서 삭제" },
          file: { method: "파일로 저장", where: "내 기기의 HTML 파일", switch: "파일은 그대로", undo: "파일 삭제" },
          link: { method: "링크로 공유", where: "서버", switch: "링크는 살아 있고, 취소 권한은 이 브라우저에만", undo: "스튜디오에서 취소" },
          fileTitle: "HTML 파일은 어떻게 쓰나요",
          fileText: "사진까지 하나로 담긴 파일이라 어떤 브라우저에서든 열립니다. 메신저나 메일에 파일로 첨부해도 되고, 나중에 보관함에 다시 불러와 고칠 수도 있습니다."
        },
        data: {
          title: "내 데이터는 어디에",
          one: "초안과 보관함은 이 브라우저의 저장소에만 있습니다. 서버로 보내지 않습니다.",
          two: "공개 링크만 서버에 저장됩니다. 마지막으로 열린 뒤 7일이 지나면 만료되고, 아무리 자주 열려도 발행 후 30일이 지나면 만료됩니다. 만료된 링크는 열리지 않습니다.",
          three: "링크 취소는 발행한 브라우저의 스튜디오에서만 할 수 있습니다. 그 브라우저를 잃었다면 만료를 기다리는 수밖에 없습니다.",
          four: "공개 링크는 검색엔진에 색인되지 않습니다.",
          five: "방문 통계 도구를 씁니다. 브라우저의 추적 거부 설정을 존중하고, 초대장 내용은 통계로 보내지 않습니다.",
          six: "초대장을 받은 분이 자기 정보가 담긴 링크를 지우고 싶다면, 보낸 분에게 취소를 요청해 주세요."
        },
        faq: {
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
          title: "이제 만들어 볼까요",
          cta: "초대장 만들기"
        }
      }
    }
  };
});
