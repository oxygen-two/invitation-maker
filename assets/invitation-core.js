(function exposeInvitationCoreCompat(root) {
  if (typeof module === "object" && module.exports) {
    module.exports = require("./invitation/core.js");
    return;
  }

  root.InvitationCore = root.InvitationCore || {};
})(typeof globalThis === "object" ? globalThis : this);
