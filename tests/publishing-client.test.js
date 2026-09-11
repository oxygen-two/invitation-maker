const test = require("node:test");
const assert = require("node:assert/strict");

const InvitationPublishing = require("../assets/publishing.js");
const SharedInvitation = require("../assets/shared-invitation.js");

const makeCrypto = () => {
  let uuid = 0;
  let byte = 1;
  return {
    randomUUID() {
      uuid += 1;
      return `00000000-0000-4000-8000-${String(uuid).padStart(12, "0")}`;
    },
    getRandomValues(bytes) {
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = byte % 256;
        byte += 1;
      }
      return bytes;
    }
  };
};

const makeStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  const calls = [];
  return {
    calls,
    getItem(key) {
      calls.push(["get", key]);
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      calls.push(["set", key, JSON.parse(value)]);
      values.set(key, String(value));
    },
    removeItem(key) {
      calls.push(["remove", key]);
      values.delete(key);
    },
    raw(key = InvitationPublishing.STORAGE_KEY) {
      return values.get(key);
    },
    snapshot(key = InvitationPublishing.STORAGE_KEY) {
      const value = values.get(key);
      return value ? JSON.parse(value) : null;
    }
  };
};

const makeClient = (options = {}) => {
  const requests = [];
  const responses = options.responses || [{ ok: true, status: 201, json: async () => ({ id: "abc123", url: "/i/abc123", expiresAt: null }) }];
  const client = InvitationPublishing.createClient({
    crypto: makeCrypto(),
    fetch: async (url, request) => {
      requests.push({ url, request });
      const response = responses.shift();
      if (response instanceof Error) throw response;
      return response;
    },
    now: () => "2026-09-10T00:00:00.000Z",
    storage: options.storage || makeStorage(),
    textEncoder: new TextEncoder(),
    withLock: options.withLock,
    normalizeInvitation: options.normalizeInvitation || ((value) => ({ ...value, normalized: true }))
  });
  return { client, requests };
};

const createPublishingMountHarness = ({
  client,
  isBusy = () => false,
  statusMessages = [],
  validate = () => true
} = {}) => {
  const events = new Map();
  const children = [];
  const makeButton = (selector) => ({
    selector,
    disabled: false,
    hidden: false,
    href: "",
    addEventListener(type, listener) {
      events.set(`${selector}:${type}`, listener);
    }
  });
  const makeStatus = (selector) => ({
    selector,
    get textContent() {
      return this.value || "";
    },
    set textContent(value) {
      this.value = value;
      statusMessages.push(value);
    }
  });
  const root = {
    dataset: {},
    get innerHTML() {
      return this.html || "";
    },
    set innerHTML(value) {
      this.html = value;
      children.length = 0;
      children.push(makeButton("#publish-button"));
      children.push(makeButton("#copy-publication-link"));
      children.push(makeButton("#publish-result-link"));
      children.push(makeStatus("#publish-status"));
      children.push({ selector: "#published-list", innerHTML: "", addEventListener(type, listener) { events.set("#published-list:click", listener); } });
    },
    querySelector(selector) {
      return children.find((child) => child.selector === selector) || null;
    }
  };
  const document = {
    querySelector: (selector) => selector === "#publishing-panel" ? root : null
  };
  InvitationPublishing.mount({
    client: client || makeClient().client,
    document,
    getValue: () => ({ title: "Mounted" }),
    isBusy,
    location: { origin: "https://example.test" },
    validate
  });
  return {
    children,
    clickPublish: () => events.get("#publish-button:click")(),
    root,
    status: root.querySelector("#publish-status")
  };
};

test("measures the POST request bytes and blocks invitations over the 2MB cap", async () => {
  const { client, requests } = makeClient();
  const invitation = { title: "A".repeat(InvitationPublishing.MAX_PUBLISH_BYTES) };

  await assert.rejects(() => client.publish(invitation), /2MB/);
  assert.equal(requests.length, 0);
});

test("persists credentials and the exact pending request before POST", async () => {
  const storage = makeStorage();
  const { client, requests } = makeClient({ storage });

  const result = await client.publish({ title: "Launch" });

  assert.deepEqual(result, { id: "abc123", url: "/i/abc123", expiresAt: null });
  const firstSet = storage.calls.find((call) => call[0] === "set");
  assert.ok(firstSet, "pending request should be written before fetch");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "/api/invitations");
  assert.equal(requests[0].request.method, "POST");
  assert.match(requests[0].request.headers.Authorization, /^Bearer [A-Za-z0-9_-]{43}$/);
  assert.match(requests[0].request.headers["Idempotency-Key"], /^00000000-0000-4000-8000-/);
  assert.deepEqual(firstSet[2].pending.body, requests[0].request.body);
  assert.equal(firstSet[2].pending.token, requests[0].request.headers.Authorization.slice("Bearer ".length));
  assert.equal(firstSet[2].pending.idempotencyKey, requests[0].request.headers["Idempotency-Key"]);
  assert.equal(storage.snapshot().pending, null);
  assert.deepEqual(storage.snapshot().publications, [{
    id: "abc123",
    url: "/i/abc123",
    title: "Launch",
    createdAt: "2026-09-10T00:00:00.000Z",
    expiresAt: null,
    sizeBytes: requests[0].request.body.length,
    token: firstSet[2].pending.token
  }]);
});

test("published JSON omits redundant legacy stops while preserving ordered items", async () => {
  const { client, requests } = makeClient({
    normalizeInvitation: () => ({
      title: "Canonical",
      items: [{ id: "course-a", type: "course", place: "A" }],
      stops: [{ place: "A" }]
    })
  });

  await client.publish({ title: "Canonical" });

  assert.deepEqual(JSON.parse(requests[0].request.body), {
    invitation: {
      title: "Canonical",
      items: [{ id: "course-a", type: "course", place: "A" }]
    }
  });
});

test("storage write failure blocks a new publish before network access", async () => {
  const storage = {
    getItem: () => null,
    setItem: () => {
      throw new Error("quota exceeded");
    }
  };
  const { client, requests } = makeClient({ storage });

  await assert.rejects(() => client.publish({ title: "No storage" }), /저장 공간/);
  assert.equal(requests.length, 0);
});

test("failed publication keeps the pending body and retry reuses credentials", async () => {
  const storage = makeStorage();
  const { client, requests } = makeClient({
    storage,
    responses: [
      new Error("network lost"),
      { ok: true, status: 201, json: async () => ({ id: "retry-id", url: "/i/retry-id", expiresAt: "2026-10-10T00:00:00.000Z" }) }
    ]
  });

  await assert.rejects(() => client.publish({ title: "Retry me" }), /network lost/);
  const pending = storage.snapshot().pending;
  assert.ok(pending);

  const result = await client.publish({ title: "Retry me" });

  assert.deepEqual(result, { id: "retry-id", url: "/i/retry-id", expiresAt: "2026-10-10T00:00:00.000Z" });
  assert.equal(requests.length, 2);
  assert.equal(requests[1].request.body, pending.body);
  assert.equal(requests[1].request.headers.Authorization, `Bearer ${pending.token}`);
  assert.equal(requests[1].request.headers["Idempotency-Key"], pending.idempotencyKey);
});

test("a lost-response pending request is retried before edited content can create another publish", async () => {
  const storage = makeStorage();
  const { client, requests } = makeClient({
    storage,
    responses: [
      new Error("response lost"),
      { ok: true, status: 201, json: async () => ({ id: "original", url: "/i/original", expiresAt: null }) }
    ]
  });

  await assert.rejects(() => client.publish({ title: "Original" }), /response lost/);
  const pending = storage.snapshot().pending;

  await client.publish({ title: "Edited after loss" });

  assert.equal(requests[1].request.body, pending.body);
  assert.match(requests[1].request.body, /Original/);
  assert.doesNotMatch(requests[1].request.body, /Edited after loss/);
  assert.equal(requests[1].request.headers.Authorization, `Bearer ${pending.token}`);
});

test("unreadable publishing storage fails clearly instead of overwriting saved tokens", async () => {
  const storage = makeStorage({ [InvitationPublishing.STORAGE_KEY]: "{broken" });
  const { client, requests } = makeClient({ storage });

  await assert.rejects(() => client.publish({ title: "Would overwrite" }), /발행 정보를 읽지 못했습니다/);
  assert.equal(requests.length, 0);
  assert.equal(storage.raw(), "{broken");
});

test("delete uses only the stored owner token and removes local metadata on 204", async () => {
  const storage = makeStorage({
    [InvitationPublishing.STORAGE_KEY]: JSON.stringify({
      pending: null,
      publications: [{ id: "owned", url: "/i/owned", title: "Owned", token: "secret-token", createdAt: "now", expiresAt: null, sizeBytes: 100 }]
    })
  });
  const { client, requests } = makeClient({
    storage,
    responses: [{ ok: true, status: 204, json: async () => ({}) }]
  });

  await client.remove("owned");

  assert.equal(requests[0].url, "/api/invitations/owned");
  assert.equal(requests[0].request.method, "DELETE");
  assert.equal(requests[0].request.headers.Authorization, "Bearer secret-token");
  assert.deepEqual(storage.snapshot().publications, []);
});

test("successful publishes retain more than twenty management tokens", async () => {
  const publications = Array.from({ length: 20 }, (_, index) => ({
    id: `old-${index}`,
    url: `/i/old-${index}`,
    title: `Old ${index}`,
    token: `token-${index}`,
    createdAt: "2026-09-01T00:00:00.000Z",
    expiresAt: null,
    sizeBytes: 100
  }));
  const storage = makeStorage({
    [InvitationPublishing.STORAGE_KEY]: JSON.stringify({ pending: null, publications })
  });
  const { client } = makeClient({
    storage,
    responses: [{ ok: true, status: 201, json: async () => ({ id: "new-one", url: "/i/new-one", expiresAt: null }) }]
  });

  await client.publish({ title: "Newest" });

  assert.equal(storage.snapshot().publications.length, 21);
  assert.equal(storage.snapshot().publications.at(-1).token, "token-19");
});

test("publish and remove run inside the injected storage lock", async () => {
  const lockCalls = [];
  const storage = makeStorage({
    [InvitationPublishing.STORAGE_KEY]: JSON.stringify({
      pending: null,
      publications: [{ id: "owned", url: "/i/owned", title: "Owned", token: "secret-token", createdAt: "now", expiresAt: null, sizeBytes: 100 }]
    })
  });
  const { client } = makeClient({
    storage,
    responses: [
      { ok: true, status: 201, json: async () => ({ id: "published", url: "/i/published", expiresAt: null }) },
      { ok: true, status: 204, json: async () => ({}) }
    ],
    withLock: async (callback) => {
      lockCalls.push("enter");
      const value = await callback();
      lockCalls.push("exit");
      return value;
    }
  });

  await client.publish({ title: "Locked" });
  await client.remove("owned");

  assert.deepEqual(lockCalls, ["enter", "exit", "enter", "exit"]);
});

test("mount renders an independent finish section and forwards validate/getValue/isBusy", async () => {
  const events = new Map();
  const children = [];
  const root = {
    dataset: {},
    get innerHTML() {
      return this.html || "";
    },
    set innerHTML(value) {
      this.html = value;
      children.length = 0;
      children.push(makeButton("#publish-button"));
      children.push(makeButton("#copy-publication-link"));
      children.push({ selector: "#publish-result-link", hidden: true });
      children.push(makeStatus("#publish-status"));
      children.push({ selector: "#published-list", innerHTML: "", addEventListener() {} });
    },
    querySelector(selector) {
      return children.find((child) => child.selector === selector) || null;
    }
  };
  const makeButton = (selector) => ({
    selector,
    disabled: false,
    addEventListener(type, listener) {
      events.set(`${selector}:${type}`, listener);
    }
  });
  const makeStatus = (selector) => ({ selector, textContent: "", hidden: false });
  const document = {
    querySelector: (selector) => selector === "#publishing-panel" ? root : null,
    createElement() {
      return {
        set innerHTML(value) { this.html = value; },
        content: { firstElementChild: root }
      };
    }
  };
  let validateCalls = 0;
  const { client } = makeClient();
  InvitationPublishing.mount({
    client,
    document,
    getValue: () => ({ title: "Mounted" }),
    isBusy: () => false,
    validate: () => {
      validateCalls += 1;
      return true;
    }
  });

  await events.get("#publish-button:click")();

  assert.equal(validateCalls, 1);
  assert.match(root.innerHTML, /publish-button/);
  assert.match(root.innerHTML, /publish-result-link/);
  assert.match(root.innerHTML, /published-list/);
  assert.match(root.innerHTML, /누구나 링크로 볼 수 있습니다/);
});

test("mount surfaces actionable publish failures without injecting raw server text", async () => {
  const harness = createPublishingMountHarness({
    client: {
      list: () => [],
      publish: async () => {
        const error = new Error("HTTP 429 raw noisy server detail");
        error.status = 429;
        throw error;
      }
    }
  });

  await harness.clickPublish();

  assert.equal(harness.status.textContent, "발행 횟수가 잠시 제한되었습니다. 잠시 후 다시 시도해 주세요.");
  assert.doesNotMatch(harness.status.textContent, /raw noisy/);
});

test("mount announces pending snapshot recovery before retrying edited content", async () => {
  const messages = [];
  const harness = createPublishingMountHarness({
    client: {
      hasPending: () => true,
      list: () => [],
      publish: async () => ({ id: "old", url: "/i/old", expiresAt: null })
    },
    statusMessages: messages
  });

  await harness.clickPublish();

  assert.match(messages[0], /이전 발행 요청/);
  assert.match(harness.status.textContent, /이전 발행 요청을 확인했습니다/);
});

test("public viewer fetches only public invitation data into a sandboxed iframe", async () => {
  const frame = {
    attributes: {},
    hidden: true,
    setAttribute(name, value) {
      this.attributes[name] = value;
    }
  };
  const status = { textContent: "" };
  const document = {
    querySelector(selector) {
      if (selector === "#shared-invitation-root") return {};
      if (selector === "#shared-invitation-frame") return frame;
      if (selector === "#shared-invitation-status") return status;
      return null;
    }
  };
  const requests = [];
  const result = await SharedInvitation.mount({
    document,
    location: { pathname: "/i/abc123" },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          expiresAt: null,
          invitation: { title: "Shared", items: [] }
        })
      };
    }
  });

  assert.equal(requests[0].url, "/api/invitations/abc123");
  assert.equal(requests[0].options.cache, "no-store");
  assert.deepEqual(Object.keys(result).sort(), ["expiresAt", "invitation"]);
  assert.equal(frame.attributes.sandbox, "allow-scripts allow-popups allow-popups-to-escape-sandbox");
  assert.equal(frame.attributes.referrerpolicy, "no-referrer");
  assert.doesNotMatch(frame.attributes.sandbox, /allow-same-origin/);
  assert.match(frame.srcdoc, /Shared/);
  assert.equal(frame.hidden, false);
});

test("shared viewer CSS preserves hidden iframe and removes the empty status strip", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const html = fs.readFileSync(path.resolve(__dirname, "../shared.html"), "utf8");

  assert.match(html, /#shared-invitation-frame\[hidden\]\s*\{\s*display:\s*none;\s*\}/);
  assert.match(html, /#shared-invitation-status:empty\s*\{\s*display:\s*none;\s*\}/);
});
