/* Reopens one of the author's OWN saved invitations, on the author's device.

   Two languages, kept apart on purpose:

   The error panel below is the product talking to the author, so it follows
   the studio language they chose next door — resolved by the engine that
   viewer.html already ran in <head>.

   The invitation itself is a finished document the author made earlier, and it
   is rebuilt in the language it was BUILT in, read back out of its own
   <html lang>. Re-languaging someone's saved invitation because they have
   since switched the studio would silently rewrite a document they considered
   done — and would make the copy they downloaded and the copy they reopen say
   different things. */
const viewerLanguage = () => globalThis.InvitationI18n?.getLanguage?.() ?? "ko";
const viewerCopy = (key) => globalThis.InvitationI18n?.t(key, undefined, viewerLanguage()) ?? key;

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
}[char]));

const showError = (message) => {
  const main = document.querySelector("main");
  main.innerHTML = `
    <h1>${escapeHtml(viewerCopy("viewer.errorTitle"))}</h1>
    <p>${escapeHtml(message)}</p>
    <a href="index.html">${escapeHtml(viewerCopy("viewer.backToStudio"))}</a>
  `;
};

/* viewer.html resolves and applies the language in <head> so <html lang> and
   the tab title are right for the first paint; the body had not been parsed at
   that point, so its bound nodes — the loading copy and the footer — need this
   second pass. Without it an English reader gets an English panel sitting on a
   Korean footer. */
globalThis.InvitationI18n?.applyDom?.(globalThis.document);

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
    // The saved file's own declared language, not the studio's current one.
    const language = InvitationCore.readStandaloneLanguage(item.html);
    const html = InvitationCore.buildStandaloneHtml(invitation, { language });
    document.open();
    document.write(html);
    document.close();
  } catch {
    showError(viewerCopy("viewer.errorBody"));
  }
})();
