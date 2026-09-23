/* One HTML escape for the whole product.

   There were six copies of this table under two names — escapeHtml in the
   invitation renderer, the intro overlay, the viewer and the publish panel,
   escapeAttribute in the studio and on the site — and they had already drifted:
   one of them wrote &#39; where the rest wrote &#039;. Every one of them is
   the last thing standing between an author's own text and the markup it is
   interpolated into, so there is one of them now, loaded before anything that
   renders. */
(function (root) {
  const ESCAPES = Object.freeze({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  });

  const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ESCAPES[char]);

  const api = { escapeHtml };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.InvitationText = api;
})(typeof window !== "undefined" ? window : globalThis);
