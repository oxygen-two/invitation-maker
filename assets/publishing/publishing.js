(function (root) {
  const STORAGE_KEY = "invitation-maker.publishing.v1";
  const MAX_PUBLISH_BYTES = 2000000;
  const API_ROOT = "/api/invitations";
  const InvitationCore = (() => {
    if (typeof module !== "undefined" && module.exports) {
      try { return require("../invitation/core.js"); } catch { return null; }
    }
    return root.InvitationCore || null;
  })();

  const I18n = (() => {
    if (typeof module !== "undefined" && module.exports) {
      try {
        const engine = require("../i18n/i18n.js");
        try {
          engine.register("ko", require("../i18n/dictionary-ko.js"));
          engine.register("en", require("../i18n/dictionary-en.js"));
        } catch {
          // Resolution still works without dictionaries.
        }
        return engine;
      } catch {
        return null;
      }
    }
    return root.InvitationI18n || null;
  })();

  /* This panel is mounted inside the studio and only ever speaks to the AUTHOR,
     so it follows the studio's language like every other control there. Read
     live rather than captured at mount, so a language change mid-session is
     already reflected the next time anything is said. Nothing in this file
     reaches a guest — what a guest sees lives in shared-invitation.js. */
  const t = (key, values) => I18n?.t(`publish.${key}`, values) ?? `publish.${key}`;

  const encodeBase64Url = (bytes) => {
    if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64url");
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return root.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  };
  const byteLength = (value, textEncoder = new TextEncoder()) => textEncoder.encode(String(value)).length;
  const safeParse = (value) => {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      throw createPublishingError(t("storeUnreadable"), "STORE_UNREADABLE");
    }
  };
  const normalizeStore = (store = {}) => ({
    pending: store.pending && typeof store.pending === "object" ? store.pending : null,
    publications: Array.isArray(store.publications) ? store.publications.filter(Boolean) : []
  });
  const normalizeInvitation = (value, normalizer = InvitationCore?.normalizeInvitation) =>
    typeof normalizer === "function" ? normalizer(value) : { ...value };
  const canonicalPublishInvitation = (invitation) => {
    if (!Array.isArray(invitation.items) || invitation.items.length === 0) return invitation;
    const canonical = { ...invitation };
    delete canonical.stops;
    return canonical;
  };
  const prepareBody = (invitation, textEncoder = new TextEncoder(), normalizer = InvitationCore?.normalizeInvitation) => {
    const normalized = canonicalPublishInvitation(normalizeInvitation(invitation, normalizer));
    const invitationJson = JSON.stringify(normalized);
    const body = JSON.stringify({ invitation: normalized });
    const requestBytes = byteLength(body, textEncoder);
    if (requestBytes > MAX_PUBLISH_BYTES || byteLength(invitationJson, textEncoder) > MAX_PUBLISH_BYTES) {
      throw createPublishingError(t("tooLarge"), "TOO_LARGE");
    }
    return { body, invitation: normalized, requestBytes };
  };
  const createToken = (cryptoApi) => {
    if (!cryptoApi?.getRandomValues) throw createPublishingError(t("tokenFailed"), "TOKEN_FAILED");
    const bytes = new Uint8Array(32);
    cryptoApi.getRandomValues(bytes);
    return encodeBase64Url(bytes);
  };
  const getTitle = (invitation) => String(invitation?.title || "").trim() || t("defaultTitle");
  const createPublishingError = (message, code, status) => {
    const error = new Error(message);
    error.code = code;
    if (status) error.status = status;
    return error;
  };
  const statusCodeFromError = (error) => error?.status || Number(String(error?.message || "").match(/^HTTP (\d+)/)?.[1]);

  /* Errors this file raised itself already carry copy in the reader's
     language, so they are passed through by CODE rather than by matching words
     inside the message. Sniffing for "저장 공간" worked only while there was
     exactly one language to sniff for; a code survives translation. */
  const PASS_THROUGH_CODES = new Set([
    "TOO_LARGE", "STORE_UNREADABLE", "NO_STORAGE", "STORAGE_UNAVAILABLE",
    "TOKEN_FAILED", "REQUEST_KEY_FAILED", "BAD_RESPONSE", "NOTHING_TO_REVOKE"
  ]);
  const messageForError = (error) => {
    if (PASS_THROUGH_CODES.has(error?.code) && error?.message) return error.message;
    const status = statusCodeFromError(error);
    if (status === 409) return t("conflict");
    if (status === 413) return t("serverTooLarge");
    if (status === 429) return t("rateLimited");
    if (status === 503) return t("storeNotReady");
    return t("publishFailed");
  };

  const createClient = ({
    crypto = root.crypto,
    fetch = root.fetch?.bind(root),
    normalizeInvitation: normalizer = InvitationCore?.normalizeInvitation,
    now = () => new Date().toISOString(),
    storage = root.localStorage,
    textEncoder = new TextEncoder(),
    withLock
  } = {}) => {
    if (typeof fetch !== "function") throw new Error("fetch is required");
    const runLocked = async (callback) => {
      if (typeof withLock === "function") return withLock(callback);
      if (root.navigator?.locks?.request) return root.navigator.locks.request(STORAGE_KEY, callback);
      return callback();
    };
    const readStore = () => {
      if (!storage?.getItem || !storage?.setItem) throw createPublishingError(t("storageUnavailable"), "STORAGE_UNAVAILABLE");
      return normalizeStore(safeParse(storage.getItem(STORAGE_KEY) || "{}"));
    };
    const writeStore = (store) => {
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(normalizeStore(store)));
      } catch {
        throw createPublishingError(t("noStorage"), "NO_STORAGE");
      }
    };
    const getOrCreatePending = (store, body, invitation, requestBytes) => {
      if (store.pending?.body === body && store.pending?.token && store.pending?.idempotencyKey) return store.pending;
      const pending = {
        body,
        createdAt: now(),
        idempotencyKey: crypto?.randomUUID?.(),
        invitation,
        requestBytes,
        title: getTitle(invitation),
        token: createToken(crypto)
      };
      if (!pending.idempotencyKey) throw createPublishingError(t("requestKeyFailed"), "REQUEST_KEY_FAILED");
      store.pending = pending;
      writeStore(store);
      return pending;
    };
    const sendPending = async (pending) => {
      const response = await fetch(API_ROOT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${pending.token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": pending.idempotencyKey
        },
        body: pending.body
      });
      if (!response.ok) throw createPublishingError(`HTTP ${response.status}`, "HTTP_STATUS", response.status);
      const result = await response.json();
      const record = {
        id: String(result.id || ""),
        url: String(result.url || ""),
        title: pending.title,
        createdAt: pending.createdAt,
        expiresAt: result.expiresAt ?? null,
        sizeBytes: pending.requestBytes,
        token: pending.token
      };
      if (!record.id || !record.url) throw createPublishingError(t("badResponse"), "BAD_RESPONSE");
      const next = readStore();
      next.pending = null;
      next.publications = [record, ...next.publications.filter((item) => item.id !== record.id)];
      writeStore(next);
      return result;
    };
    const publishUnlocked = async (value) => {
      const store = readStore();
      if (store.pending?.body && store.pending?.token && store.pending?.idempotencyKey) {
        return sendPending(store.pending);
      }
      const { body, invitation, requestBytes } = prepareBody(value, textEncoder, normalizer);
      const pending = getOrCreatePending(store, body, invitation, requestBytes);
      return sendPending(pending);
    };
    const publish = (value) => runLocked(() => publishUnlocked(value));
    const list = () => readStore().publications;
    const hasPending = () => {
      try {
        const pending = readStore().pending;
        return Boolean(pending?.body && pending?.token && pending?.idempotencyKey);
      } catch {
        return false;
      }
    };
    const removeUnlocked = async (id) => {
      const store = readStore();
      const record = store.publications.find((item) => item.id === id);
      if (!record?.token) throw createPublishingError(t("nothingToRevoke"), "NOTHING_TO_REVOKE");
      const response = await fetch(`${API_ROOT}/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${record.token}` }
      });
      if (response.status !== 204 && !response.ok) throw new Error(`HTTP ${response.status}`);
      store.publications = store.publications.filter((item) => item.id !== id);
      writeStore(store);
    };
    const remove = (id) => runLocked(() => removeUnlocked(id));
    return { hasPending, list, prepare: (value) => prepareBody(value, textEncoder, normalizer), publish, remove };
  };

  const formatExpiry = (value) => {
    if (!value) return t("noExpiry");
    return I18n?.formatDateTime(value, { dateStyle: "medium", timeStyle: "short" }) ?? t("expiryUnknown");
  };
  const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);

  /* The static copy carries data-i18n as well as its rendered text, so the
     engine's applyDom pass re-translates this panel on a language change
     without it having to be torn down and rebuilt. The dynamic parts — the
     status line and the publication cards — are re-rendered through t() at the
     moment they are written instead. */
  const bind = (key) => `data-i18n="publish.${key}"`;
  const copy = (key) => escapeHtml(t(key));
  const renderShell = (rootNode) => {
    rootNode.innerHTML = `
      <div class="publishing-header">
        <div>
          <p class="eyebrow" ${bind("eyebrow")}>${copy("eyebrow")}</p>
          <h2 ${bind("heading")}>${copy("heading")}</h2>
        </div>
        <span class="publishing-limit" ${bind("limit")}>${copy("limit")}</span>
      </div>
      <p class="publishing-consent" ${bind("consent")}>${copy("consent")}</p>
      <div class="publishing-actions">
        <button id="publish-button" class="primary-button" type="button" autofocus ${bind("publishButton")}>${copy("publishButton")}</button>
        <a id="publish-result-link" class="publication-link" href="#" target="_blank" rel="noopener noreferrer" hidden ${bind("openLink")}>${copy("openLink")}</a>
        <button id="copy-publication-link" class="secondary-button" type="button" hidden ${bind("copyLink")}>${copy("copyLink")}</button>
        <button id="revoke-publication-link" class="secondary-button" type="button" hidden ${bind("revokeLink")}>${copy("revokeLink")}</button>
      </div>
      <p id="publish-status" class="publishing-status" role="status" aria-live="polite"></p>
      <div>
        <h3 class="publication-list-title" ${bind("listTitle")}>${copy("listTitle")}</h3>
        <div id="published-list" class="publication-list"></div>
      </div>
    `;
  };

  const mount = ({
    client = createClient(),
    clipboard = root.navigator?.clipboard,
    document = root.document,
    getValue,
    isBusy = () => false,
    location = root.location,
    validate = () => true
  } = {}) => {
    const rootNode = document?.querySelector?.("#publishing-panel");
    if (!rootNode || rootNode.dataset.publishingMounted === "true") return null;
    if (typeof getValue !== "function") throw new Error("getValue is required");
    rootNode.dataset.publishingMounted = "true";
    renderShell(rootNode);
    const publishButton = rootNode.querySelector("#publish-button");
    const status = rootNode.querySelector("#publish-status");
    const link = rootNode.querySelector("#publish-result-link");
    const copyButton = rootNode.querySelector("#copy-publication-link");
    const revokeButton = rootNode.querySelector("#revoke-publication-link");
    const listNode = rootNode.querySelector("#published-list");
    let latestUrl = "";
    let latestId = "";
    let pending = false;
    const setStatus = (message) => { status.textContent = message; };
    const absoluteUrl = (url) => {
      try { return new URL(url, location?.origin || "http://localhost").href; } catch { return url; }
    };
    const syncBusy = () => { publishButton.disabled = pending || Boolean(isBusy()); };
    const copyUrl = async (url) => {
      try {
        await clipboard?.writeText?.(absoluteUrl(url));
        setStatus(t("copied"));
      } catch {
        setStatus(t("copyFailed"));
      }
    };
    const hideResult = () => {
      link.hidden = true;
      copyButton.hidden = true;
      if (revokeButton) revokeButton.hidden = true;
      latestUrl = "";
      latestId = "";
    };
    const revokePublication = async (id, onSuccess) => {
      setStatus(t("deleting"));
      try {
        await client.remove(id);
        setStatus(t("deleted"));
        renderList();
        onSuccess?.();
      } catch {
        setStatus(t("deleteFailed"));
      }
    };
    const renderList = () => {
      let publications = [];
      try {
        publications = client.list();
      } catch (error) {
        setStatus(error.message || t("storageUnavailable"));
      }
      listNode.innerHTML = publications.length ? publications.map((item) => `
        <article class="publication-card" data-publication-id="${escapeHtml(item.id)}">
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <span>${formatExpiry(item.expiresAt)}</span>
          </div>
          <div class="publication-card-actions">
            <a data-publish-action="open" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t("cardOpen"))}</a>
            <button type="button" data-publish-action="copy" data-publication-url="${escapeHtml(item.url)}">${escapeHtml(t("cardCopy"))}</button>
            <button type="button" data-publish-action="revoke" data-publication-id="${escapeHtml(item.id)}">${escapeHtml(t("cardRevoke"))}</button>
          </div>
        </article>
      `).join("") : `<p class="publication-empty">${escapeHtml(t("listEmpty"))}</p>`;
    };
    publishButton.addEventListener("click", async () => {
      if (pending) return;
      if (isBusy()) {
        setStatus(t("busy"));
        return;
      }
      if (!validate()) {
        setStatus(t("invalid"));
        return;
      }
      pending = true;
      syncBusy();
      const recovering = Boolean(client.hasPending?.());
      setStatus(t(recovering ? "recovering" : "publishing"));
      try {
        const result = await client.publish(getValue());
        latestUrl = result.url;
        latestId = result.id;
        link.href = result.url;
        link.hidden = false;
        copyButton.hidden = false;
        if (revokeButton) revokeButton.hidden = false;
        setStatus(`${t(recovering ? "recovered" : "published")} ${formatExpiry(result.expiresAt)}.`);
        renderList();
      } catch (error) {
        setStatus(messageForError(error));
      } finally {
        pending = false;
        syncBusy();
      }
    });
    copyButton.addEventListener("click", () => {
      if (latestUrl) copyUrl(latestUrl);
    });
    revokeButton?.addEventListener("click", () => {
      if (latestId) revokePublication(latestId, hideResult);
    });
    listNode.addEventListener("click", async (event) => {
      const copy = event.target.closest?.('[data-publish-action="copy"]');
      if (copy) {
        await copyUrl(copy.dataset.publicationUrl);
        return;
      }
      const revoke = event.target.closest?.('[data-publish-action="revoke"]');
      if (!revoke) return;
      const revokedId = revoke.dataset.publicationId;
      await revokePublication(revokedId, () => {
        if (revokedId === latestId) hideResult();
      });
    });
    renderList();
    syncBusy();
    return { renderList };
  };

  const api = { API_ROOT, MAX_PUBLISH_BYTES, STORAGE_KEY, byteLength, createClient, formatExpiry, mount, prepareBody };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.InvitationPublishing = api;
})(typeof window !== "undefined" ? window : globalThis);
