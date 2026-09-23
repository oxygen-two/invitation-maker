const test = require("node:test");
const assert = require("node:assert/strict");

const InvitationPublishing = require("../assets/publishing/publishing.js");
const SharedInvitation = require("../assets/publishing/shared-invitation.js");
const InvitationI18n = require("../assets/i18n/i18n.js");

/* The panel's copy moved into the dictionaries, so these assertions read the
   expected sentence from there rather than repeating it. The literal
   guarantees are kept alongside, so a translation that quietly dropped the
   point of a message still fails. The panel speaks to the AUTHOR and so
   follows the studio language; pinned to Korean here to keep the expectations
   independent of test ordering. */
InvitationI18n.setLanguage("ko", { persist: false });
const publishCopy = (key, values) => InvitationI18n.t(`publish.${key}`, values, "ko");

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
  clipboard,
  getValue = () => ({ title: "Mounted" }),
  isBusy = () => false,
  share,
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
  // The QR canvas is the one node the panel hands to a drawing routine rather
  // than only toggling, so the stand-in records what was painted on it.
  const makeCanvas = (selector) => ({
    selector,
    width: 0,
    height: 0,
    fills: [],
    getContext() {
      const fills = this.fills;
      return { fillStyle: "", fillRect(...args) { fills.push(args); } };
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
      children.push(makeButton("#revoke-publication-link"));
      children.push(makeButton("#copy-publication-message"));
      if (value.includes('id="share-publication-link"')) children.push(makeButton("#share-publication-link"));
      children.push({ selector: "#publication-qr", hidden: true });
      children.push(makeCanvas("#publication-qr-canvas"));
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
    clipboard,
    document,
    getValue,
    isBusy,
    location: { origin: "https://example.test" },
    share,
    validate
  });
  return {
    children,
    click: (selector) => events.get(`${selector}:click`)(),
    clickPublish: () => events.get("#publish-button:click")(),
    root,
    status: root.querySelector("#publish-status")
  };
};

/* mountPublicationList renders the same list as the panel above, but into the
   library. Its only test was a source-regex over app.js asserting the literal
   spelling of the call site, so the rendering, the copy handler and the revoke
   handler had never been run. This is the sibling of the harness above: a node
   that parses what was written into it, so a click can be aimed at a real card
   rather than at a string. */
const createPublicationListHarness = ({
  client,
  clipboard,
  onChange,
  statusMessages = []
} = {}) => {
  let listener = () => {};
  const cardsFrom = (markup) => [...String(markup).matchAll(/<article class="publication-card" data-publication-id="([^"]*)">([\s\S]*?)<\/article>/g)]
    .map(([, id, body]) => {
      const card = { id, actions: new Map(), title: body.match(/<strong>([^<]*)<\/strong>/)?.[1] || "", expiry: body.match(/<span>([^<]*)<\/span>/)?.[1] || "" };
      for (const [, tag, action] of body.matchAll(/<(?:a|button)\b([^>]*data-publish-action="([a-z]+)"[^>]*)>/g)) {
        const attrs = Object.fromEntries([...tag.matchAll(/([a-z-]+)="([^"]*)"/g)].map(([, name, value]) => [name, value]));
        const node = {
          attrs,
          dataset: {
            publicationId: attrs["data-publication-id"],
            publicationUrl: attrs["data-publication-url"]
          },
          closest(selector) {
            return selector === `[data-publish-action="${action}"]` ? this : null;
          }
        };
        card.actions.set(action, node);
      }
      return card;
    });

  const node = {
    renders: 0,
    addEventListener(type, handler) {
      if (type === "click") listener = handler;
    },
    get innerHTML() { return this.html || ""; },
    set innerHTML(markup) {
      this.html = markup;
      this.renders += 1;
      this.cards = cardsFrom(markup);
    }
  };

  const mounted = InvitationPublishing.mountPublicationList({
    node,
    client,
    clipboard,
    onChange,
    setStatus: (message) => statusMessages.push(message)
  });

  return {
    node,
    mounted,
    statusMessages,
    card: (id) => node.cards.find((entry) => entry.id === id),
    // The listener is delegated on the list, so a click arrives as an event
    // whose target is inside a card, exactly as the browser delivers it.
    click: (id, action) => {
      const target = node.cards.find((entry) => entry.id === id)?.actions.get(action);
      assert.ok(target, `no ${action} control on ${id}`);
      return listener({ target });
    }
  };
};

const publication = (id, overrides = {}) => ({
  id,
  title: `Invitation ${id}`,
  url: `/i/${id}`,
  expiresAt: "2026-10-01T09:00:00.000Z",
  ...overrides
});

test("the library list renders a card per publication with open, copy and revoke", () => {
  const harness = createPublicationListHarness({
    client: { list: () => [publication("aaa"), publication("bbb", { expiresAt: null })] }
  });

  assert.equal(harness.node.renders, 1, "mounting renders once");
  assert.equal(harness.node.cards.length, 2);
  assert.equal(harness.card("aaa").title, "Invitation aaa");
  assert.equal(harness.card("aaa").actions.get("open").attrs.href, "/i/aaa");
  assert.equal(harness.card("aaa").actions.get("open").attrs.rel, "noopener noreferrer");
  assert.equal(harness.card("aaa").actions.get("copy").dataset.publicationUrl, "/i/aaa");
  assert.equal(harness.card("bbb").actions.get("revoke").dataset.publicationId, "bbb");
  // A publication with no expiry says so rather than rendering an empty slot.
  assert.equal(harness.card("bbb").expiry, publishCopy("noExpiry"));
});

test("an empty library list says so instead of rendering nothing", () => {
  const harness = createPublicationListHarness({ client: { list: () => [] } });

  assert.match(harness.node.innerHTML, /<p class="publication-empty">/);
  assert.ok(harness.node.innerHTML.includes(publishCopy("listEmpty")));
  assert.doesNotMatch(harness.node.innerHTML, /publication-card/);
});

test("a title carrying markup is escaped into the card, not interpreted", () => {
  const harness = createPublicationListHarness({
    client: { list: () => [publication("xss", { title: '<img src=x onerror="alert(1)">' })] }
  });

  assert.doesNotMatch(harness.node.innerHTML, /<img/);
  assert.match(harness.node.innerHTML, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
});

test("copying a card's link writes the absolute URL and says so", async () => {
  const written = [];
  const harness = createPublicationListHarness({
    client: { list: () => [publication("aaa")] },
    clipboard: { writeText: async (value) => { written.push(value); } }
  });

  await harness.click("aaa", "copy");

  assert.deepEqual(written, ["https://invitation-maker-one.vercel.app/i/aaa"],
    "a guest is handed a path; a clipboard has to carry the whole link");
  assert.deepEqual(harness.statusMessages, [publishCopy("copied")]);
});

test("a clipboard that refuses is reported to the author rather than swallowed", async () => {
  const harness = createPublicationListHarness({
    client: { list: () => [publication("aaa")] },
    clipboard: { writeText: async () => { throw new Error("denied"); } }
  });

  await harness.click("aaa", "copy");

  assert.deepEqual(harness.statusMessages, [publishCopy("copyFailed")]);
});

test("revoking a card removes it, re-renders, and tells the library which id went", async () => {
  const records = [publication("aaa"), publication("bbb")];
  const removed = [];
  const changed = [];
  const harness = createPublicationListHarness({
    client: {
      list: () => records,
      remove: async (id) => {
        removed.push(id);
        records.splice(records.findIndex((entry) => entry.id === id), 1);
      }
    },
    onChange: (id) => changed.push(id)
  });

  await harness.click("bbb", "revoke");

  assert.deepEqual(removed, ["bbb"]);
  assert.deepEqual(changed, ["bbb"], "the library card list has to drop the same publication");
  assert.equal(harness.node.renders, 2, "the list re-renders off the store, not off the DOM");
  assert.deepEqual(harness.node.cards.map((card) => card.id), ["aaa"]);
  assert.deepEqual(harness.statusMessages, [publishCopy("deleted")]);
});

test("a revoke the server refuses leaves the card in place and says what happened", async () => {
  const harness = createPublicationListHarness({
    client: {
      list: () => [publication("aaa")],
      remove: async () => { throw Object.assign(new Error("nope"), { status: 503 }); }
    }
  });

  await harness.click("aaa", "revoke");

  assert.deepEqual(harness.statusMessages, [publishCopy("deleteFailed")]);
  assert.deepEqual(harness.node.cards.map((card) => card.id), ["aaa"], "the link is still live, so its card stays");
});

test("a click on the card but on neither button does nothing at all", async () => {
  const removed = [];
  const harness = createPublicationListHarness({
    client: { list: () => [publication("aaa")], remove: async (id) => removed.push(id) }
  });

  await harness.click("aaa", "open");

  assert.deepEqual(removed, []);
  assert.deepEqual(harness.statusMessages, []);
  assert.equal(harness.node.renders, 1);
});

test("a store that cannot be read reports itself instead of rendering a blank list", () => {
  const harness = createPublicationListHarness({
    client: { list: () => { throw new Error("quota exceeded"); } }
  });

  assert.deepEqual(harness.statusMessages, ["quota exceeded"]);
  assert.ok(harness.node.innerHTML.includes(publishCopy("listEmpty")));
});

test("mounting against no node is a no-op with a render that cannot throw", () => {
  const mounted = InvitationPublishing.mountPublicationList({ node: null });

  assert.equal(typeof mounted.render, "function");
  assert.equal(mounted.render(), undefined);
});

/* B-9: the dialog used to say "Share a link", then "SHARE", then "Public link",
   and only promised the expiry date AFTER the author had already published. */

test("the panel carries no heading of its own, so the dialog title is the only one", () => {
  const harness = createPublishingMountHarness();

  assert.doesNotMatch(harness.root.innerHTML, /<h2/, "the dialog already has the heading");
  assert.doesNotMatch(harness.root.innerHTML, /publishing-header/);
  assert.doesNotMatch(harness.root.innerHTML, /data-i18n="publish\.(?:eyebrow|heading)"/);
  // The published list keeps its sub-heading: one level below the dialog title.
  assert.match(harness.root.innerHTML, /<h3 class="publication-list-title"/);
});

test("the panel points at each link's own expiry instead of repeating the rule", () => {
  const harness = createPublishingMountHarness();
  const html = harness.root.innerHTML;

  // The rule itself lives in the dialog's static markup (tests/site-pages.test.js),
  // and this panel renders inside that dialog. A separate expiryPolicy sentence
  // used to repeat that same idea a third time above the publish button; it was
  // folded into the consent sentence so the panel makes its point once.
  assert.ok(html.includes(publishCopy("consent")), "the panel still says where an expiry date can be read");
  assert.doesNotMatch(publishCopy("consent"), /7일|30일|7 days|30 days/);
  assert.ok(html.indexOf(publishCopy("consent")) < html.indexOf("publish-button"),
    "the consent sentence comes before the publish button");
  assert.doesNotMatch(publishCopy("consent"), /발행 후 만료일/,
    "the consent sentence no longer defers the expiry to after publishing");
});

test('"2MB max" is replaced by a hint an author can act on', () => {
  const harness = createPublishingMountHarness();

  assert.ok(harness.root.innerHTML.includes(publishCopy("limitHint")));
  assert.match(publishCopy("limitHint"), /압축/);
  assert.doesNotMatch(harness.root.innerHTML, /data-i18n="publish\.limit"/);
  assert.doesNotMatch(harness.root.innerHTML, /2MB/);
});

test("the system share sheet is offered only where the browser has one", () => {
  const offered = createPublishingMountHarness({ share: async () => {} });
  assert.match(offered.root.innerHTML, /id="share-publication-link"/);
  assert.ok(offered.root.innerHTML.includes(publishCopy("share")));

  const absent = createPublishingMountHarness({ share: null });
  assert.doesNotMatch(absent.root.innerHTML, /share-publication-link/);
  assert.doesNotMatch(absent.root.innerHTML, /publish\.share"/);
});

test("a published link comes with a QR code, the share sheet and a ready-made message", async () => {
  const copied = [];
  const shared = [];
  const harness = createPublishingMountHarness({
    client: { list: () => [], publish: async () => ({ id: "qr1", url: "/i/qr1", expiresAt: null }) },
    clipboard: { writeText: async (text) => { copied.push(text); } },
    getValue: () => ({ title: "Garden party", dateLabel: "2026.10.03 SAT 17:00" }),
    share: async (data) => { shared.push(data); }
  });

  const canvas = harness.root.querySelector("#publication-qr-canvas");
  assert.equal(harness.root.querySelector("#publication-qr").hidden, true, "nothing to encode before publishing");
  assert.match(harness.root.innerHTML, /id="publication-qr-canvas"[^>]*aria-label="[^"]+"/);
  assert.ok(harness.root.innerHTML.includes(publishCopy("qrLabel")));

  await harness.clickPublish();

  assert.equal(harness.root.querySelector("#publication-qr").hidden, false);
  assert.ok(canvas.width > 0, "the QR code is drawn onto the canvas");
  assert.equal(canvas.width, canvas.height, "a QR symbol is square");
  assert.ok(canvas.fills.length > 1, "the canvas is painted, not just sized");

  harness.click("#share-publication-link");
  await Promise.resolve();
  assert.deepEqual(shared, [{ title: "Garden party", url: "https://example.test/i/qr1" }]);

  harness.click("#copy-publication-message");
  await Promise.resolve();
  assert.deepEqual(copied, ["Garden party · 2026.10.03 SAT 17:00 · https://example.test/i/qr1"]);
  assert.match(copied[0], /Garden party/);
  assert.match(copied[0], /2026\.10\.03 SAT 17:00/);
  assert.match(copied[0], /https:\/\/example\.test\/i\/qr1/);
  assert.equal(harness.status.textContent, publishCopy("messageCopied"));
});

/* The invitation's own date label is optional — an author who never set one
   still gets a message worth sending, and it should read as two parts, not
   three with a hole punched in the middle. Checked in both languages: the
   parts themselves (title, url) are the author's own content and never
   translated, but the join has to behave the same regardless of which
   dictionary is active. */
test("the copied message skips an empty date instead of leaving a blank segment", async () => {
  for (const language of InvitationI18n.SUPPORTED) {
    InvitationI18n.setLanguage(language, { persist: false });
    try {
      const copied = [];
      const harness = createPublishingMountHarness({
        client: { list: () => [], publish: async () => ({ id: "qr-no-date", url: "/i/qr-no-date", expiresAt: null }) },
        clipboard: { writeText: async (text) => { copied.push(text); } },
        getValue: () => ({ title: "Garden party", dateLabel: "" })
      });

      await harness.clickPublish();
      harness.click("#copy-publication-message");
      await Promise.resolve();

      assert.deepEqual(copied, ["Garden party · https://example.test/i/qr-no-date"], `${language}: no empty date segment`);
      assert.doesNotMatch(copied[0], /·\s*·/, `${language}: no adjacent separators from a dropped part`);
    } finally {
      InvitationI18n.setLanguage("ko", { persist: false });
    }
  }
});

test("the QR code encodes the absolute public link a guest would scan", async () => {
  const harness = createPublishingMountHarness({
    client: { list: () => [], publish: async () => ({ id: "qr2", url: "/i/qr2", expiresAt: null }) }
  });

  await harness.clickPublish();

  const canvas = harness.root.querySelector("#publication-qr-canvas");
  const matrix = require("../assets/publishing/qr.js").encode("https://example.test/i/qr2");
  assert.equal(canvas.width, (matrix.size + 8) * 5, "quiet zone of 4 modules on each side, 5px per module");
  assert.equal(canvas.fills.length, matrix.modules.flat().filter(Boolean).length + 1);
});

test("a cancelled share sheet is a choice, not an error the author has to read", async () => {
  const harness = createPublishingMountHarness({
    client: { list: () => [], publish: async () => ({ id: "qr3", url: "/i/qr3", expiresAt: null }) },
    share: async () => {
      const error = new Error("cancelled");
      error.name = "AbortError";
      throw error;
    }
  });

  await harness.clickPublish();
  const afterPublish = harness.status.textContent;
  harness.click("#share-publication-link");
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(harness.status.textContent, afterPublish);
});

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
    },
    // The studio language at the moment of publishing, pinned to ko at the top
    // of this file. It travels with the snapshot, not inside the invitation.
    language: "ko"
  });
});

/* The author writes in one language and the guest may read in another, so the
   language the studio was in when Publish was pressed has to be recorded here
   or it is lost for good. Read live rather than captured, so switching the
   studio language and publishing again records the new one. */
test("the publish payload carries the studio language the author was writing in", () => {
  try {
    for (const language of InvitationI18n.SUPPORTED) {
      InvitationI18n.setLanguage(language, { persist: false });
      const prepared = InvitationPublishing.prepareBody({ title: "Language" });
      assert.equal(prepared.language, language);
      assert.equal(JSON.parse(prepared.body).language, language);
    }
  } finally {
    InvitationI18n.setLanguage("ko", { persist: false });
  }
});

test("storage write failure blocks a new publish before network access", async () => {
  const storage = {
    getItem: () => null,
    setItem: () => {
      throw new Error("quota exceeded");
    }
  };
  const { client, requests } = makeClient({ storage });

  await assert.rejects(
    () => client.publish({ title: "No storage" }),
    (error) => {
      assert.equal(error.message, publishCopy("noStorage"));
      // Carried as a code so the pass-through in messageForError survives
      // translation instead of sniffing for Korean words in the sentence.
      assert.equal(error.code, "NO_STORAGE");
      assert.match(error.message, /저장 공간/);
      return true;
    }
  );
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

  await assert.rejects(
    () => client.publish({ title: "Would overwrite" }),
    (error) => {
      assert.equal(error.message, publishCopy("storeUnreadable"));
      assert.equal(error.code, "STORE_UNREADABLE");
      assert.match(error.message, /발행 정보를 읽지 못했어요/);
      return true;
    }
  );
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
  assert.ok(root.innerHTML.includes(publishCopy("consent")));
  assert.match(publishCopy("consent"), /누구나 볼 수 있고/);
  // The static copy is bound as well as rendered, so the engine's applyDom
  // pass retranslates the panel on a language change without a remount.
  assert.match(root.innerHTML, /data-i18n="publish\.consent"/);
  assert.match(root.innerHTML, /data-i18n="publish\.publishButton"/);
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

  assert.equal(harness.status.textContent, publishCopy("rateLimited"));
  assert.equal(publishCopy("rateLimited"), "발행 횟수가 잠시 제한됐어요. 조금 뒤에 다시 시도해 주세요.");
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

  assert.equal(messages[0], publishCopy("recovering"));
  assert.match(messages[0], /이전 발행 요청/);
  assert.ok(harness.status.textContent.startsWith(publishCopy("recovered")));
  assert.match(harness.status.textContent, /이전 발행 요청을 확인했어요/);
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

/* The guest-facing language decision, exercised rather than read off source.

   A guest lands on /i/<id> having made no choice in the studio, so the page
   chrome around the invitation follows their own language. The invitation
   itself is somebody else's finished document, so its baked chrome follows the
   language the record was published in — never the reader's. */
const sharedHarness = () => {
  const frame = { attributes: {}, hidden: true, setAttribute(name, value) { this.attributes[name] = value; } };
  const nodes = {
    "#shared-invitation-root": {},
    "#shared-invitation-frame": frame,
    "#shared-invitation-status": { textContent: "" },
    "#shared-invitation-error": { hidden: true },
    "#shared-invitation-error-eyebrow": { textContent: "" },
    "#shared-invitation-error-title": { textContent: "" },
    "#shared-invitation-error-description": { textContent: "" },
    "#shared-invitation-error-hint": { textContent: "" },
    "#shared-invitation-header": { hidden: true },
    "#shared-invitation-footer": { hidden: true }
  };
  return { frame, nodes, document: { querySelector: (selector) => nodes[selector] ?? null } };
};

test("a guest's not-found page speaks the guest's language", async () => {
  for (const language of InvitationI18n.SUPPORTED) {
    const harness = sharedHarness();

    await SharedInvitation.mount({
      document: harness.document,
      language,
      location: { pathname: "/i/missing1" },
      fetch: async () => ({ ok: false, status: 404 })
    });

    const expect = (key) => InvitationI18n.t(`shared.${key}`, undefined, language);
    assert.equal(harness.nodes["#shared-invitation-error-title"].textContent, expect("notFoundTitle"));
    assert.equal(harness.nodes["#shared-invitation-error-description"].textContent, expect("notFoundDescription"));
    assert.equal(harness.nodes["#shared-invitation-error-hint"].textContent, expect("notFoundHint"));
    assert.equal(harness.nodes["#shared-invitation-error-eyebrow"].textContent, expect("notFoundEyebrow"));
    assert.equal(harness.nodes["#shared-invitation-error"].hidden, false);
    assert.equal(harness.nodes["#shared-invitation-header"].hidden, false);
  }

  // The three failure kinds stay distinguishable rather than collapsing onto
  // one apologetic sentence.
  const titles = ["notFound", "gone", "failed"].map((kind) => InvitationI18n.t(`shared.${kind}Title`, undefined, "ko"));
  assert.equal(new Set(titles).size, titles.length);
});

test("a published invitation is never re-languaged to suit whoever opens the link", async () => {
  const invitation = { title: "서울숲 저녁 초대", items: [{ id: "n1", type: "notice", heading: "주차 안내", body: "지하 2층" }] };
  const rendered = [];

  for (const language of InvitationI18n.SUPPORTED) {
    const harness = sharedHarness();

    await SharedInvitation.mount({
      document: harness.document,
      language,
      location: { pathname: "/i/abc123" },
      fetch: async () => ({ ok: true, json: async () => ({ expiresAt: null, invitation }) })
    });

    rendered.push(harness.frame.srcdoc);
    // The author's words, untouched, whoever is reading.
    assert.match(harness.frame.srcdoc, /서울숲 저녁 초대/);
    assert.match(harness.frame.srcdoc, /주차 안내/);
  }

  // An English-speaking guest and a Korean-speaking one receive byte-identical
  // documents. The reader's preference changes the page around the frame, not
  // what is inside it.
  assert.equal(new Set(rendered).size, 1, "the frame must not follow the reader's language");
  assert.match(rendered[0], /<html lang="ko">/);
  assert.ok(rendered[0].includes(InvitationI18n.t("invitation.noticeEyebrow", undefined, "ko")));
});

test("the frame speaks the language the invitation was published in", async () => {
  const invitation = { title: "Dinner at ours", items: [{ id: "n1", type: "notice", heading: "Parking", body: "Level 2" }] };
  const rendered = [];

  for (const language of InvitationI18n.SUPPORTED) {
    const harness = sharedHarness();

    await SharedInvitation.mount({
      document: harness.document,
      // The guest reads in the other language throughout, so a frame that
      // followed the reader would give the two runs the same document.
      language: language === "en" ? "ko" : "en",
      location: { pathname: "/i/abc123" },
      fetch: async () => ({ ok: true, json: async () => ({ expiresAt: null, invitation, language }) })
    });

    rendered.push(harness.frame.srcdoc);
    assert.match(harness.frame.srcdoc, new RegExp(`<html lang="${language}">`));
    assert.ok(
      harness.frame.srcdoc.includes(InvitationI18n.t("invitation.noticeEyebrow", undefined, language)),
      `the baked chrome should be ${language}`
    );
  }

  assert.equal(new Set(rendered).size, InvitationI18n.SUPPORTED.length);
});

test("a record published before the language field existed still renders in Korean", async () => {
  for (const readerLanguage of InvitationI18n.SUPPORTED) {
    const harness = sharedHarness();

    await SharedInvitation.mount({
      document: harness.document,
      language: readerLanguage,
      location: { pathname: "/i/abc123" },
      fetch: async () => ({ ok: true, json: async () => ({ expiresAt: null, invitation: { title: "Legacy", items: [] } }) })
    });

    assert.match(harness.frame.srcdoc, /<html lang="ko">/);
  }
});

test("an expiry shown to a guest is formatted for the guest", async () => {
  const expiresAt = "2026-10-01T05:00:00.000Z";
  const seen = [];

  for (const language of InvitationI18n.SUPPORTED) {
    const harness = sharedHarness();
    await SharedInvitation.mount({
      document: harness.document,
      language,
      location: { pathname: "/i/abc123" },
      fetch: async () => ({ ok: true, json: async () => ({ expiresAt, invitation: { title: "T", items: [] } }) })
    });
    const shown = harness.nodes["#shared-invitation-status"].textContent;
    assert.ok(shown.includes("2026"), shown);
    assert.doesNotMatch(shown, /2026-10-01T/, "a raw ISO timestamp is not copy");
    seen.push(shown);
  }

  assert.equal(new Set(seen).size, seen.length, "the expiry line should differ per language");
});

test("shared viewer CSS preserves hidden iframe and removes the empty status strip", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const html = fs.readFileSync(path.resolve(__dirname, "../shared.html"), "utf8");

  assert.match(html, /#shared-invitation-frame\[hidden\]\s*\{\s*display:\s*none;\s*\}/);
  assert.match(html, /#shared-invitation-status:empty\s*\{\s*display:\s*none;\s*\}/);
});

/* Batch 5 — taking a live link down.

   Revoking is the one irreversible thing the library can do, and the address
   is already in other people's hands. It used to fire on the first click. The
   question is now asked inside the card it is about, the way the item cards in
   the editor ask it — never through window.confirm, the one dialog in the
   studio that cannot be translated, styled, or dismissed like the rest. */
const attributeMatches = (element, selector) =>
  [...String(selector).matchAll(/\[([a-z-]+)(?:="([^"]*)")?\]/g)]
    .every(([, name, value]) => (value === undefined
      ? Object.hasOwn(element.attributes, name)
      : element.attributes[name] === value));

const makePublicationListNode = () => {
  const listeners = new Map();
  const node = {
    activeElement: null,
    attributes: {},
    elements: [],
    html: "",
    focus() { node.activeElement = node; },
    setAttribute(name, value) { node.attributes[name] = String(value); },
    getAttribute(name) { return Object.hasOwn(node.attributes, name) ? node.attributes[name] : null; },
    addEventListener(type, handler) {
      listeners.set(type, [...(listeners.get(type) || []), handler]);
    },
    async dispatch(type, event) {
      for (const handler of listeners.get(type) || []) await handler(event);
    },
    querySelector(selector) {
      return node.elements.find((element) => attributeMatches(element, selector)) || null;
    },
    querySelectorAll(selector) {
      return node.elements.filter((element) => attributeMatches(element, selector));
    },
    set innerHTML(markup) {
      node.html = markup;
      node.elements = [...String(markup).matchAll(/<[a-z]+\b([^>]*)>/g)].map(([, attributesText]) => {
        const attributes = {};
        for (const [, name, value] of attributesText.matchAll(/([a-z-]+)(?:="([^"]*)")?/g)) {
          attributes[name] = value ?? "";
        }
        const element = {
          attributes,
          dataset: Object.fromEntries(Object.entries(attributes)
            .filter(([name]) => name.startsWith("data-"))
            .map(([name, value]) => [name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), value])),
          hidden: Object.hasOwn(attributes, "hidden"),
          closest(selector) { return attributeMatches(element, selector) ? element : null; },
          focus() { node.activeElement = element; }
        };
        return element;
      });
    },
    get innerHTML() { return node.html; }
  };
  return node;
};

const twoPublications = [
  { id: "pub-1", title: "Picnic", url: "/i/pub-1", expiresAt: null },
  { id: "pub-2", title: "Housewarming", url: "/i/pub-2", expiresAt: null }
];

const mountLibraryList = ({ publications = [{ id: "pub-1", title: "Picnic", url: "/i/pub-1", expiresAt: null }] } = {}) => {
  const removed = [];
  const statuses = [];
  const node = makePublicationListNode();
  InvitationPublishing.mountPublicationList({
    node,
    client: {
      list: () => publications,
      async remove(id) {
        removed.push(id);
        publications = publications.filter((item) => item.id !== id);
      }
    },
    clipboard: { async writeText() {} },
    setStatus: (message) => statuses.push(message)
  });
  return { node, removed, statuses };
};

const clickAction = (harness, action, id = "pub-1") => harness.node.dispatch("click", {
  target: harness.node.querySelector(`[data-publish-action="${action}"][data-publication-id="${id}"]`)
});

test("a library card asks before it takes a live link down", async () => {
  const harness = mountLibraryList();
  const confirmRow = () => harness.node.querySelector('[data-revoke-confirm="pub-1"]');

  assert.equal(confirmRow().hidden, true, "the question is asked, not pre-asked");
  await clickAction(harness, "revoke");

  assert.deepEqual(harness.removed, [], "the first click revoked without asking");
  assert.equal(confirmRow().hidden, false, "the question never appeared");
  // Focus lands on the half that changes nothing, which is also what Escape does.
  assert.equal(harness.node.activeElement, harness.node.querySelector('[data-publish-action="revoke-cancel"]'));
  assert.ok(harness.node.innerHTML.includes(publishCopy("confirmRevoke", { title: "Picnic" })));
  assert.ok(harness.node.innerHTML.includes(publishCopy("confirmRevokeKeep")));
  // The destructive half says what it does: the card's trigger reads 취소,
  // which on its own could be read as cancelling the question itself.
  assert.ok(harness.node.innerHTML.includes(publishCopy("confirmRevokeAccept")));
});

test("keeping the link, by button or by Escape, leaves it live and gives the trigger its focus back", async () => {
  for (const dismiss of ["button", "escape"]) {
    const harness = mountLibraryList();
    await clickAction(harness, "revoke");

    if (dismiss === "button") await clickAction(harness, "revoke-cancel");
    else await harness.node.dispatch("keydown", { key: "Escape", preventDefault() {} });

    assert.deepEqual(harness.removed, [], `${dismiss}: the link was taken down anyway`);
    assert.equal(harness.node.querySelector('[data-revoke-confirm="pub-1"]').hidden, true, `${dismiss}: the question stayed open`);
    assert.equal(
      harness.node.activeElement,
      harness.node.querySelector('[data-publish-action="revoke"][data-publication-id="pub-1"]'),
      `${dismiss}: focus was left nowhere`
    );
  }
});

test("answering the question takes the link down and says so where the list can be heard", async () => {
  const harness = mountLibraryList();

  await clickAction(harness, "revoke");
  await clickAction(harness, "revoke-confirm");

  assert.deepEqual(harness.removed, ["pub-1"]);
  assert.ok(harness.statuses.includes(publishCopy("deleted")), "the result was never announced");
  assert.ok(harness.node.innerHTML.includes(publishCopy("listEmpty")));
});

test("copying a link from the library says so too, rather than into a no-op", async () => {
  const harness = mountLibraryList();

  await harness.node.dispatch("click", {
    target: harness.node.querySelector('[data-publish-action="copy"]')
  });

  assert.ok(harness.statuses.includes(publishCopy("copied")));
});

test("the library list never reaches for window.confirm", () => {
  const source = require("node:fs").readFileSync(require("node:path").join(__dirname, "../assets/publishing/publishing.js"), "utf8");
  assert.doesNotMatch(source, /(?:^|[^\w.])confirm\s*\(/);
});

/* render() replaces the whole list, so the button that was just pressed stops
   existing and focus falls to <body> — the top of the document, on a stage the
   author was working in. It goes to whatever took the revoked card's place. */
test("revoking hands focus to the card that took its place", async () => {
  const harness = mountLibraryList({ publications: [...twoPublications] });

  await clickAction(harness, "revoke", "pub-1");
  await clickAction(harness, "revoke-confirm", "pub-1");

  assert.deepEqual(harness.removed, ["pub-1"]);
  assert.equal(
    harness.node.activeElement,
    harness.node.querySelector('[data-publish-action="revoke"][data-publication-id="pub-2"]'),
    "focus was not handed to the remaining card"
  );
});

test("revoking the last link leaves focus on the list rather than on nothing", async () => {
  const harness = mountLibraryList();

  await clickAction(harness, "revoke", "pub-1");
  await clickAction(harness, "revoke-confirm", "pub-1");

  assert.ok(harness.node.innerHTML.includes(publishCopy("listEmpty")));
  assert.equal(harness.node.activeElement, harness.node, "focus fell out of the list");
  // Which is only reachable because the list can hold focus without being a
  // stop in the Tab order.
  assert.equal(harness.node.getAttribute("tabindex"), "-1");
});
