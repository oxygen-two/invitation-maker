(function (root) {
  const STORAGE_KEY = "invitation-maker.publishing.v1";
  const MAX_PUBLISH_BYTES = 2000000;
  const API_ROOT = "/api/invitations";
  const strings = Object.freeze({
    busy: "사진 처리나 저장이 끝난 뒤 발행할 수 있습니다.",
    copyFailed: "링크를 복사하지 못했습니다.",
    deleting: "공개 링크를 취소하고 있습니다.",
    deleteFailed: "공개 링크 취소에 실패했습니다.",
    invalid: "초대장 내용을 먼저 확인해 주세요.",
    noStorage: "브라우저 저장 공간에 기록하지 못해 발행할 수 없습니다.",
    published: "공개 링크를 만들었습니다.",
    publishing: "공개 링크를 만들고 있습니다.",
    recovering: "이전 발행 요청을 먼저 확인하고 있습니다.",
    recovered: "이전 발행 요청을 확인했습니다.",
    publishFailed: "발행에 실패했습니다. 다시 누르면 같은 요청으로 재시도합니다.",
    storageUnavailable: "브라우저 저장 공간을 사용할 수 없습니다."
  });

  const InvitationCore = (() => {
    if (typeof module !== "undefined" && module.exports) {
      try { return require("../invitation/core.js"); } catch { return null; }
    }
    return root.InvitationCore || null;
  })();

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
      throw new Error("이 브라우저의 발행 정보를 읽지 못했습니다. 기존 링크 취소 정보 보호를 위해 새 발행을 중단했습니다.");
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
      throw new Error("2MB 이하 초대장만 공개 링크로 발행할 수 있습니다.");
    }
    return { body, invitation: normalized, requestBytes };
  };
  const createToken = (cryptoApi) => {
    if (!cryptoApi?.getRandomValues) throw new Error("보안 토큰을 만들 수 없습니다.");
    const bytes = new Uint8Array(32);
    cryptoApi.getRandomValues(bytes);
    return encodeBase64Url(bytes);
  };
  const getTitle = (invitation) => String(invitation?.title || "공개 초대장").trim() || "공개 초대장";
  const createPublishingError = (message, code, status) => {
    const error = new Error(message);
    error.code = code;
    if (status) error.status = status;
    return error;
  };
  const statusCodeFromError = (error) => error?.status || Number(String(error?.message || "").match(/^HTTP (\d+)/)?.[1]);
  const messageForError = (error) => {
    if (/2MB/.test(error?.message || "")) return error.message;
    if (/저장 공간|발행 정보를 읽지 못했습니다|브라우저 저장 공간/.test(error?.message || "")) return error.message;
    const status = statusCodeFromError(error);
    if (status === 409) return "이전 발행 요청과 다른 내용입니다. 잠시 후 다시 시도해 주세요.";
    if (status === 413) return "초대장이 2MB를 넘었습니다. 사진을 줄인 뒤 다시 시도해 주세요.";
    if (status === 429) return "발행 횟수가 잠시 제한되었습니다. 잠시 후 다시 시도해 주세요.";
    if (status === 503) return "발행 서버 저장소가 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.";
    return strings.publishFailed;
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
      if (!storage?.getItem || !storage?.setItem) throw new Error(strings.storageUnavailable);
      return normalizeStore(safeParse(storage.getItem(STORAGE_KEY) || "{}"));
    };
    const writeStore = (store) => {
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(normalizeStore(store)));
      } catch {
        throw new Error(strings.noStorage);
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
      if (!pending.idempotencyKey) throw new Error("요청 키를 만들 수 없습니다.");
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
      if (!record.id || !record.url) throw new Error("발행 응답이 올바르지 않습니다.");
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
      if (!record?.token) throw new Error("취소할 수 있는 발행 정보가 없습니다.");
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
    if (!value) return "자동 만료 없음";
    const date = new Date(String(value));
    if (!Number.isFinite(date.getTime())) return "만료일 확인 필요";
    return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(date);
  };
  const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);

  const renderShell = (rootNode) => {
    rootNode.innerHTML = `
      <div class="publishing-header">
        <div>
          <p class="eyebrow">Share</p>
          <h2>공개 링크</h2>
        </div>
        <span class="publishing-limit">2MB 이하</span>
      </div>
      <p class="publishing-consent">공개 링크를 만들면 주소를 아는 누구나 링크로 볼 수 있습니다. 발행 후 만료일을 확인할 수 있습니다.</p>
      <div class="publishing-actions">
        <button id="publish-button" class="primary-button" type="button" autofocus>공개 링크 만들기</button>
        <a id="publish-result-link" class="publication-link" href="#" target="_blank" rel="noopener noreferrer" hidden>링크 열기</a>
        <button id="copy-publication-link" class="secondary-button" type="button" hidden>링크 복사</button>
        <button id="revoke-publication-link" class="secondary-button" type="button" hidden>취소</button>
      </div>
      <p id="publish-status" class="publishing-status" role="status" aria-live="polite"></p>
      <div>
        <h3 class="publication-list-title">이 브라우저의 발행 목록</h3>
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
        setStatus("링크를 복사했습니다.");
      } catch {
        setStatus(strings.copyFailed);
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
      setStatus(strings.deleting);
      try {
        await client.remove(id);
        setStatus("공개 링크를 취소했습니다.");
        renderList();
        onSuccess?.();
      } catch {
        setStatus(strings.deleteFailed);
      }
    };
    const renderList = () => {
      let publications = [];
      try {
        publications = client.list();
      } catch (error) {
        setStatus(error.message || strings.storageUnavailable);
      }
      listNode.innerHTML = publications.length ? publications.map((item) => `
        <article class="publication-card" data-publication-id="${escapeHtml(item.id)}">
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <span>${formatExpiry(item.expiresAt)}</span>
          </div>
          <div class="publication-card-actions">
            <a data-publish-action="open" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">열기</a>
            <button type="button" data-publish-action="copy" data-publication-url="${escapeHtml(item.url)}">복사</button>
            <button type="button" data-publish-action="revoke" data-publication-id="${escapeHtml(item.id)}">취소</button>
          </div>
        </article>
      `).join("") : '<p class="publication-empty">아직 공개한 초대장이 없습니다.</p>';
    };
    publishButton.addEventListener("click", async () => {
      if (pending) return;
      if (isBusy()) {
        setStatus(strings.busy);
        return;
      }
      if (!validate()) {
        setStatus(strings.invalid);
        return;
      }
      pending = true;
      syncBusy();
      const recovering = Boolean(client.hasPending?.());
      setStatus(recovering ? strings.recovering : strings.publishing);
      try {
        const result = await client.publish(getValue());
        latestUrl = result.url;
        latestId = result.id;
        link.href = result.url;
        link.hidden = false;
        copyButton.hidden = false;
        if (revokeButton) revokeButton.hidden = false;
        setStatus(`${recovering ? strings.recovered : strings.published} ${formatExpiry(result.expiresAt)}.`);
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
