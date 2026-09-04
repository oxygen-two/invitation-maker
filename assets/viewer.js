const STORAGE_KEY = "invitation-maker.saved";

const showError = (message) => {
  const main = document.querySelector("main");
  main.innerHTML = `
    <h1>초대장을 열 수 없습니다.</h1>
    <p>${message}</p>
    <a href="index.html">제작기로 돌아가기</a>
  `;
};

try {
  const id = new URLSearchParams(window.location.search).get("id");
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  const item = Array.isArray(saved) ? saved.find((entry) => entry?.id === id) : null;
  if (!item || typeof item.html !== "string") throw new Error("missing invitation");

  const parsed = new DOMParser().parseFromString(item.html, "text/html");
  const payload = parsed.querySelector('#invitation-data[type="application/json"]');
  if (!payload) throw new Error("invalid invitation");

  const invitation = InvitationCore.normalizeInvitation(JSON.parse(payload.textContent));
  const html = InvitationCore.buildStandaloneHtml(invitation);
  document.open();
  document.write(html);
  document.close();
} catch {
  showError("등록 목록에서 초대장을 확인한 뒤 다시 시도해 주세요.");
}
