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

  const QR = (() => {
    if (typeof module !== "undefined" && module.exports) {
      try { return require("./qr.js"); } catch { return null; }
    }
    return root.InvitationQR || null;
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

  // Diagnostics are best-effort and carry only the reporter's closed fields;
  // being best-effort is the reporter's own contract, not a copy kept here.
  const reportFault = (context, error, options) =>
    root.InvitationErrorReporting?.reportFault?.(context, error, options);

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
  /* The studio language at the instant Publish is pressed. A publication is a
     snapshot, and the language its chrome was written in is part of it: without
     this the shared page has nothing to render an English author's invitation
     from and falls back to Korean. Read live rather than captured at load, and
     sent beside the invitation rather than inside it, because it describes the
     rendering a guest gets and not the author's content. */
  const authorLanguage = () => I18n?.getLanguage?.() || I18n?.DEFAULT_LANGUAGE || "ko";
  const prepareBody = (invitation, textEncoder = new TextEncoder(), normalizer = InvitationCore?.normalizeInvitation) => {
    const normalized = canonicalPublishInvitation(normalizeInvitation(invitation, normalizer));
    const language = authorLanguage();
    const invitationJson = JSON.stringify(normalized);
    const body = JSON.stringify({ invitation: normalized, language });
    const requestBytes = byteLength(body, textEncoder);
    if (requestBytes > MAX_PUBLISH_BYTES || byteLength(invitationJson, textEncoder) > MAX_PUBLISH_BYTES) {
      throw createPublishingError(t("tooLarge"), "TOO_LARGE");
    }
    return { body, invitation: normalized, language, requestBytes };
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
    return I18n?.formatTimestamp(value) ?? t("expiryUnknown");
  };
  const { escapeHtml } = (() => {
    if (typeof module !== "undefined" && module.exports) return require("../shared/text.js");
    return root.InvitationText;
  })();

  /* The static copy carries data-i18n as well as its rendered text, so the
     engine's applyDom pass re-translates this panel on a language change
     without it having to be torn down and rebuilt. The dynamic parts — the
     status line and the publication cards — are re-rendered through t() at the
     moment they are written instead. */
  const bind = (key) => `data-i18n="publish.${key}"`;
  const copy = (key) => escapeHtml(t(key));
  /* The panel has no heading of its own. It is mounted inside a dialog already
     titled "Share a link", and a second "SHARE / Public link" heading under it
     only made the author read the same word three times (audit B-9). What the
     author actually needs before deciding opens the panel instead: who can see
     the page, how long the link lasts, and what happens to the photos. The
     expiry rule is the one in docs/publishing.md — it used to be promised
     AFTER publishing, which is too late to be a decision. */
  const renderShell = (rootNode, { canShare } = {}) => {
    rootNode.innerHTML = `
      <p class="publishing-consent" ${bind("consent")}>${copy("consent")}</p>
      <p class="publishing-limit" ${bind("limitHint")}>${copy("limitHint")}</p>
      <div class="publishing-actions">
        <button id="publish-button" class="primary-button" type="button" autofocus ${bind("publishButton")}>${copy("publishButton")}</button>
        <a id="publish-result-link" class="publication-link" href="#" target="_blank" rel="noopener noreferrer" hidden ${bind("openLink")}>${copy("openLink")}</a>
        <button id="copy-publication-link" class="secondary-button" type="button" hidden ${bind("copyLink")}>${copy("copyLink")}</button>
        ${canShare ? `<button id="share-publication-link" class="secondary-button" type="button" hidden ${bind("share")}>${copy("share")}</button>` : ""}
        <button id="copy-publication-message" class="secondary-button" type="button" hidden ${bind("copyMessage")}>${copy("copyMessage")}</button>
        <button id="revoke-publication-link" class="secondary-button" type="button" hidden ${bind("revokeLink")}>${copy("revokeLink")}</button>
      </div>
      <p id="publish-status" class="publishing-status" role="status" aria-live="polite"></p>
      <div id="publication-qr" class="publishing-qr" hidden>
        <canvas id="publication-qr-canvas" class="publishing-qr-canvas" role="img" data-i18n-attr="aria-label:publish.qrLabel" aria-label="${copy("qrLabel")}"></canvas>
      </div>
      <div>
        <h3 class="publication-list-title" ${bind("listTitle")}>${copy("listTitle")}</h3>
        <div id="published-list" class="publication-list"></div>
      </div>
    `;
  };

  const PUBLIC_ORIGIN = "https://invitation-maker-one.vercel.app";
  const absoluteUrl = (url, location) => {
    try {
      return new URL(url, location?.href || location?.origin || PUBLIC_ORIGIN).href;
    } catch {
      return url;
    }
  };

  /* Revoking is the one thing on a card that cannot be undone, and the address
     is already in other people's hands — it used to happen on the first click.
     The question is asked inside the card it is about, the way the editor's
     item cards ask it, and never through the browser's own confirm dialog. It
     is rendered with every card, hidden, so both mounts of this list ask it. */
  const renderPublicationCards = (publications) => publications.length ? publications.map((item) => `
        <article class="publication-card" data-publication-id="${escapeHtml(item.id)}">
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <span>${formatExpiry(item.expiresAt)}</span>
          </div>
          <div class="publication-card-actions">
            <a data-publish-action="open" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t("cardOpen"))}</a>
            <button type="button" data-publish-action="copy" data-publication-url="${escapeHtml(item.url)}">${escapeHtml(t("cardCopy"))}</button>
            <button type="button" data-publish-action="revoke" data-publication-id="${escapeHtml(item.id)}" aria-expanded="false" aria-controls="revoke-confirm-${escapeHtml(item.id)}">${escapeHtml(t("cardRevoke"))}</button>
          </div>
          <div class="publication-confirm" id="revoke-confirm-${escapeHtml(item.id)}" data-revoke-confirm="${escapeHtml(item.id)}" role="group" aria-label="${escapeHtml(t("cardRevoke"))}" hidden>
            <p class="publication-confirm-text">${escapeHtml(t("confirmRevoke", { title: item.title }))}</p>
            <div class="publication-confirm-actions">
              <button class="publication-confirm-keep" type="button" data-publish-action="revoke-cancel" data-publication-id="${escapeHtml(item.id)}">${escapeHtml(t("confirmRevokeKeep"))}</button>
              <button class="publication-confirm-revoke" type="button" data-publish-action="revoke-confirm" data-publication-id="${escapeHtml(item.id)}">${escapeHtml(t("confirmRevokeAccept"))}</button>
            </div>
          </div>
        </article>
      `).join("") : `<p class="publication-empty">${escapeHtml(t("listEmpty"))}</p>`;

  /* The published links are the author's own record of what is live, and they
     are readable in two places: inside the share dialog, behind the finish
     step, and in the library, which is where someone goes to find an
     invitation they made. That was two copies of this list, with their own
     copy and revoke handlers beside them — so a fix to one silently skipped
     the other. One list, mounted twice. */
  const createPublicationList = ({
    node,
    client,
    clipboard,
    location,
    onRevoked,
    setStatus
  }) => {
    let openConfirmId = null;
    const revokeButtons = () => [...(node.querySelectorAll?.('[data-publish-action="revoke"]') || [])];
    const revokeButtonFor = (id) =>
      node.querySelector?.(`[data-publish-action="revoke"][data-publication-id="${id}"]`);
    /* The list is not a stop in the Tab order, but it has to be able to hold
       focus: when the last link goes, there is no button left to hand it to
       and the alternative is <body> — the top of the document, on a stage the
       author was in the middle of. */
    node.setAttribute?.("tabindex", "-1");
    const closeRevokeConfirm = ({ focusTrigger = false } = {}) => {
      const closedId = openConfirmId;
      openConfirmId = null;
      for (const row of node.querySelectorAll?.("[data-revoke-confirm]") || []) row.hidden = true;
      for (const button of node.querySelectorAll?.('[data-publish-action="revoke"]') || []) {
        button.setAttribute?.("aria-expanded", "false");
      }
      if (focusTrigger && closedId) revokeButtonFor(closedId)?.focus?.();
      return Boolean(closedId);
    };
    const openRevokeConfirm = (id) => {
      closeRevokeConfirm();
      const row = node.querySelector?.(`[data-revoke-confirm="${id}"]`);
      if (!row) return;
      row.hidden = false;
      openConfirmId = id;
      revokeButtonFor(id)?.setAttribute?.("aria-expanded", "true");
      // Focus lands on the half that changes nothing, which is also where
      // Escape leaves you.
      node.querySelector?.(`[data-publish-action="revoke-cancel"][data-publication-id="${id}"]`)?.focus?.();
    };

    const render = () => {
      let publications = [];
      try {
        publications = client.list();
      } catch (error) {
        reportFault("publish_list", error);
        setStatus(error.message || t("storageUnavailable"));
      }
      openConfirmId = null;
      node.innerHTML = renderPublicationCards(publications);
    };

    const copyUrl = async (url) => {
      try {
        await clipboard?.writeText?.(absoluteUrl(url, location));
        setStatus(t("copied"));
      } catch (error) {
        reportFault("publish_copy", error);
        setStatus(t("copyFailed"));
      }
    };

    /* Taking a link down is the one irreversible thing on this card, and it
       reaches a network, so it says what it is doing before it starts. */
    /* One revoke for both mounts, settled on what the dialog's did:

       - it says "taking it down…" first. Revoking reaches a network, and the
         only other feedback is the card vanishing, so a slow server otherwise
         looks like a button that did nothing.
       - it re-renders only when something changed. A refused revoke leaves the
         store exactly as it was, and repainting the list under the author's
         cursor says "something happened" when nothing did.
       - onRevoked fires only on success: the dialog uses it to put its result
         panel away, and a link that is still live must keep its panel. */
    const revoke = async (id) => {
      // Where the card sat, so focus can go to whatever takes its place.
      const position = revokeButtons().findIndex((button) => button.dataset?.publicationId === id);
      closeRevokeConfirm();
      setStatus(t("deleting"));
      try {
        await client.remove(id);
        setStatus(t("deleted"));
        render();
        onRevoked?.(id);
      } catch (error) {
        reportFault("publish_revoke", error, { status: statusCodeFromError(error) });
        setStatus(t("deleteFailed"));
      }
      /* A successful revoke replaced the markup, so the button that was just
         pressed no longer exists and focus would fall out of the list. It goes
         to the card that moved up into the gap — or to the last one, when the
         gap was at the end — and to the list itself when nothing is left. A
         refused one re-focuses the card that stayed, which is the same line. */
      const remaining = revokeButtons();
      const next = remaining[Math.min(Math.max(position, 0), remaining.length - 1)];
      (next || node)?.focus?.();
    };

    node.addEventListener("click", async (event) => {
      const copy = event.target.closest?.('[data-publish-action="copy"]');
      if (copy) {
        await copyUrl(copy.dataset.publicationUrl);
        return;
      }
      const keep = event.target.closest?.('[data-publish-action="revoke-cancel"]');
      if (keep) {
        closeRevokeConfirm({ focusTrigger: true });
        return;
      }
      const ask = event.target.closest?.('[data-publish-action="revoke"]');
      if (ask) {
        openRevokeConfirm(ask.dataset.publicationId);
        return;
      }
      const answered = event.target.closest?.('[data-publish-action="revoke-confirm"]');
      if (answered) await revoke(answered.dataset.publicationId);
    });

    // Escape answers the question the safe way, wherever it is asked.
    node.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (closeRevokeConfirm({ focusTrigger: true })) event.preventDefault?.();
    });

    render();
    return { copyUrl, render, revoke };
  };

  const mountPublicationList = ({
    node,
    client = createClient(),
    clipboard = root.navigator?.clipboard,
    location = root.location,
    onChange,
    setStatus = () => {}
  } = {}) => {
    if (!node) return { render: () => {} };
    const { render } = createPublicationList({
      node,
      client,
      clipboard,
      location,
      onRevoked: onChange,
      setStatus
    });
    return { render };
  };

  const mount = ({
    client = createClient(),
    clipboard = root.navigator?.clipboard,
    document = root.document,
    getValue,
    isBusy = () => false,
    location = root.location,
    /* Only offered where the platform has a share sheet — a desktop browser
       without one would otherwise show a button that does nothing. Bound here
       rather than called off navigator later, because some engines throw on an
       unbound navigator.share. */
    share = root.navigator?.share ? (data) => root.navigator.share(data) : null,
    validate = () => true
  } = {}) => {
    const rootNode = document?.querySelector?.("#publishing-panel");
    if (!rootNode || rootNode.dataset.publishingMounted === "true") return null;
    if (typeof getValue !== "function") throw new Error("getValue is required");
    rootNode.dataset.publishingMounted = "true";
    renderShell(rootNode, { canShare: typeof share === "function" });
    const publishButton = rootNode.querySelector("#publish-button");
    const status = rootNode.querySelector("#publish-status");
    const link = rootNode.querySelector("#publish-result-link");
    const copyButton = rootNode.querySelector("#copy-publication-link");
    const shareButton = rootNode.querySelector("#share-publication-link");
    const messageButton = rootNode.querySelector("#copy-publication-message");
    const revokeButton = rootNode.querySelector("#revoke-publication-link");
    const qrBox = rootNode.querySelector("#publication-qr");
    const qrCanvas = rootNode.querySelector("#publication-qr-canvas");
    const listNode = rootNode.querySelector("#published-list");
    let latestUrl = "";
    let latestId = "";
    let latestTitle = "";
    let latestDate = "";
    let pending = false;
    const setStatus = (message) => { status.textContent = message; };
    const linkUrl = (url) => absoluteUrl(url, location);
    const syncBusy = () => { publishButton.disabled = pending || Boolean(isBusy()); };
    /* The same list the library mounts, from the same store, with the same
       copy and revoke behind its cards. The only thing this mount adds is what
       to do when the link being taken down is the one the panel is showing. */
    const publicationList = createPublicationList({
      node: listNode,
      client,
      clipboard,
      location,
      onRevoked: (revokedId) => { if (revokedId === latestId) hideResult(); },
      setStatus
    });
    const renderList = publicationList.render;
    const copyUrl = publicationList.copyUrl;
    /* The QR code is the offline half of sharing: a phone pointed at a laptop
       screen, or at a printed card. It is drawn from the ABSOLUTE url, because
       "/i/abc" means nothing to a camera. A failure here never blocks the link
       itself — the author still has copy, share and the anchor. */
    const renderQr = (url) => {
      if (!qrCanvas || typeof QR?.draw !== "function") return;
      try {
        QR.draw(qrCanvas, url, { scale: 5 });
        if (qrBox) qrBox.hidden = false;
      } catch (error) {
        reportFault("publish_qr", error);
        if (qrBox) qrBox.hidden = true;
      }
    };
    const showResult = (result) => {
      latestUrl = result.url;
      latestId = result.id;
      link.href = result.url;
      link.hidden = false;
      copyButton.hidden = false;
      if (shareButton) shareButton.hidden = false;
      if (messageButton) messageButton.hidden = false;
      if (revokeButton) revokeButton.hidden = false;
      renderQr(linkUrl(result.url));
    };
    const hideResult = () => {
      link.hidden = true;
      copyButton.hidden = true;
      if (shareButton) shareButton.hidden = true;
      if (messageButton) messageButton.hidden = true;
      if (revokeButton) revokeButton.hidden = true;
      if (qrBox) qrBox.hidden = true;
      latestUrl = "";
      latestId = "";
      latestTitle = "";
      latestDate = "";
    };
    const shareLink = async () => {
      if (!latestUrl || typeof share !== "function") return;
      try {
        await share({ title: latestTitle || t("defaultTitle"), url: linkUrl(latestUrl) });
      } catch (error) {
        // Dismissing the sheet is a decision, not a failure to report.
        if (error?.name === "AbortError") return;
        setStatus(t("shareFailed"));
      }
    };
    /* The message an author actually sends: the invitation's own title and date
       label — authored content, never translated — next to the link, so pasting
       it into a chat says what the link is. Built from parts rather than a
       fixed template so a blank date (no dateLabel on the invitation) drops
       out cleanly instead of leaving a bare "· ·" between title and url. */
    const copyMessage = async () => {
      if (!latestUrl) return;
      const parts = [latestTitle || t("defaultTitle"), latestDate, linkUrl(latestUrl)]
        .map((part) => String(part ?? "").trim())
        .filter(Boolean);
      const message = parts.join(" · ");
      try {
        await clipboard?.writeText?.(message);
        setStatus(t("messageCopied"));
      } catch {
        setStatus(t("messageCopyFailed"));
      }
    };
    publishButton.addEventListener("click", async () => {
      if (pending) return;
      if (isBusy()) {
        setStatus(t("busy"));
        return;
      }
      /* The studio's validate() can end in a question asked inside the page
         (an RSVP item with nothing to reply to), so it answers with a promise.
         Reading the promise itself would be truthy every time and publish
         whatever the author answered. */
      if (!await validate()) {
        setStatus(t("invalid"));
        return;
      }
      pending = true;
      syncBusy();
      const recovering = Boolean(client.hasPending?.());
      setStatus(t(recovering ? "recovering" : "publishing"));
      try {
        const value = getValue();
        const result = await client.publish(value);
        latestTitle = getTitle(value);
        latestDate = String(value?.dateLabel || "").trim();
        showResult(result);
        setStatus(`${t(recovering ? "recovered" : "published")} ${formatExpiry(result.expiresAt)}.`);
        renderList();
      } catch (error) {
        const status = statusCodeFromError(error);
        reportFault("publish", error, { kind: status ? "network" : "handled", status });
        setStatus(messageForError(error));
      } finally {
        pending = false;
        syncBusy();
      }
    });
    copyButton.addEventListener("click", () => {
      if (latestUrl) copyUrl(latestUrl);
    });
    shareButton?.addEventListener("click", () => { shareLink(); });
    messageButton?.addEventListener("click", () => { copyMessage(); });
    revokeButton?.addEventListener("click", () => {
      if (latestId) publicationList.revoke(latestId);
    });
    syncBusy();
    return { renderList };
  };

  const api = { API_ROOT, MAX_PUBLISH_BYTES, STORAGE_KEY, byteLength, createClient, formatExpiry, mount, mountPublicationList, prepareBody };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.InvitationPublishing = api;
})(typeof window !== "undefined" ? window : globalThis);
