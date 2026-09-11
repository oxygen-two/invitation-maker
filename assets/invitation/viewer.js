const showError = (message) => {
  const main = document.querySelector("main");
  main.innerHTML = `
    <h1>초대장을 열 수 없습니다.</h1>
    <p>${message}</p>
    <a href="index.html">제작기로 돌아가기</a>
  `;
};

(async () => {
  try {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) throw new Error("missing invitation id");

    const item = await InvitationStorage.get(id);
    if (!item || typeof item.html !== "string") throw new Error("missing invitation");

    const parsed = new DOMParser().parseFromString(item.html, "text/html");
    const payloads = parsed.querySelectorAll('#invitation-data[type="application/json"]');
    if (payloads.length !== 1) throw new Error("invalid invitation");
    const [payload] = payloads;

    const data = JSON.parse(payload.textContent);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("invalid invitation payload");
    }
    const invitation = InvitationCore.normalizeInvitation(data);
    const html = InvitationCore.buildStandaloneHtml(invitation);
    document.open();
    document.write(html);
    document.close();
  } catch {
    showError("등록 목록에서 초대장을 확인한 뒤 다시 시도해 주세요.");
  }
})();
