const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { Readable } = require("node:stream");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const { MongoClient } = require("mongodb");

const { normalizeInvitation } = require("../assets/invitation-core.js");
const { createHandler } = require("../server/http.cjs");
const { createMongoPublicationsRepository } = require("../server/storage/mongo-publications.cjs");
const { createAdminMongoPublications } = require("../admin/storage/mongo-publications.cjs");

const TOKEN = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64url");
const OTHER_TOKEN = Buffer.from("abcdef0123456789abcdef0123456789").toString("base64url");
const IDEMPOTENCY_KEY = "123e4567-e89b-12d3-a456-426614174000";
const PNG_1X1 = "data:image/png;base64,iVBORw0KGgo=";
const JPEG_BYTES_AS_PNG = "data:image/png;base64,/9j/4AAQSkZJRg==";
const PNG_WITH_BAD_PADDING = "data:image/png;base64,iVBORw0KGgo";

const request = async (handler, pathName, options = {}) => {
  const server = http.createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}${pathName}`, options);
    const text = await response.text();
    const contentType = response.headers.get("content-type") || "";
    const body = text && contentType.includes("application/json") ? JSON.parse(text) : text || null;
    return { status: response.status, headers: response.headers, body };
  } finally {
    server.close();
    await once(server, "close");
  }
};

const callHandler = async (handler, { method = "GET", url = "/", headers = {}, body } = {}) => {
  const req = new Readable({ read() { this.push(null); } });
  req.method = method;
  req.url = url;
  req.headers = headers;
  req.body = body;
  req.socket = { remoteAddress: "127.0.0.1", encrypted: false };
  let statusCode = 0;
  let responseHeaders = {};
  let payload = "";
  const res = {
    writeHead(status, outgoingHeaders) {
      statusCode = status;
      responseHeaders = outgoingHeaders;
    },
    end(chunk = "") {
      payload += chunk;
      this.resolve();
    },
    on() {},
    once() {},
    resolve() {}
  };
  await new Promise((resolve) => {
    res.resolve = resolve;
    handler(req, res);
  });
  return {
    status: statusCode,
    headers: responseHeaders,
    body: payload ? JSON.parse(payload) : null
  };
};

const bearerHeaders = (extra = {}) => ({
  authorization: `Bearer ${TOKEN}`,
  "content-type": "application/json",
  "idempotency-key": IDEMPOTENCY_KEY,
  ...extra
});

class FakeRepository {
  constructor() {
    this.records = new Map();
    this.publishes = [];
    this.refreshes = [];
    this.nextError = null;
    this.refreshError = null;
  }

  async publish(input) {
    this.publishes.push(input);
    if (this.nextError) throw this.nextError;
    const existing = [...this.records.values()].find((record) =>
      record.idempotencyKeyHash === input.idempotencyKeyHash
        && record.tokenHash === input.tokenHash
        && record.contentHash === input.contentHash
    );
    if (existing) return { id: existing.id, expiresAt: existing.expiresAt };
    const record = {
      id: "AbCdEfGhIjKlMnOpQrStUv",
      invitation: input.invitation,
      tokenHash: input.tokenHash,
      idempotencyKeyHash: input.idempotencyKeyHash,
      contentHash: input.contentHash,
      createdAt: input.now || new Date(),
      expiresAt: input.expiresAt
    };
    this.records.set(record.id, record);
    return { id: record.id, expiresAt: record.expiresAt };
  }

  async get(id) {
    return this.records.get(id) || null;
  }

  // Mirrors the Mongo repository's monotonic guard: an expiry never moves back.
  async refreshExpiry({ id, expiresAt }) {
    this.refreshes.push({ id, expiresAt });
    if (this.refreshError) throw this.refreshError;
    const record = this.records.get(id);
    if (!record) return false;
    const next = new Date(expiresAt);
    const current = record.expiresAt ? new Date(record.expiresAt) : null;
    if (current && current.getTime() >= next.getTime()) return false;
    record.expiresAt = next.toISOString();
    return true;
  }

  async remove({ id, tokenHash }) {
    const record = this.records.get(id);
    if (!record) return false;
    if (record.tokenHash !== tokenHash) return false;
    this.records.delete(id);
    return true;
  }
}

// The Mongo repository enforces expiry inside the read query itself, so an
// expired publication is never returned and never extended. This fake mirrors
// that contract. `FakeRepository` above deliberately does not, which keeps the
// handler's own expiry guard covered for any store that hands one back anyway.
class ExpiryEnforcingRepository extends FakeRepository {
  async get(id, { now = new Date() } = {}) {
    const record = await super.get(id);
    if (!record) return null;
    return record.expiresAt && new Date(record.expiresAt).getTime() <= now.getTime() ? null : record;
  }

  async refreshExpiry({ id, expiresAt, now = new Date() }) {
    const record = this.records.get(id);
    if (record?.expiresAt && new Date(record.expiresAt).getTime() <= now.getTime()) {
      this.refreshes.push({ id, expiresAt, rejected: true });
      return false;
    }
    return super.refreshExpiry({ id, expiresAt });
  }
}

const createTestHandler = (repository = new FakeRepository(), config = {}) => createHandler({
  repository,
  config: {
    maxPayloadBytes: 2_000_000,
    trustProxy: false,
    rateLimitPerHour: 10,
    totalDailyLimit: 100,
    lifetimeLimit: 1000,
    ...config
  }
});

test("POST stores only a validated normalized invitation and returns a public URL", async () => {
  const repository = new FakeRepository();
  const handler = createTestHandler(repository);

  const result = await request(handler, "/api/invitations", {
    method: "POST",
    headers: bearerHeaders(),
    body: JSON.stringify({
      invitation: {
        title: "서버 발행 초대장",
        heroImage: { src: PNG_1X1, scale: 151 },
        items: [{ type: "photo", src: PNG_1X1, caption: "대표 사진" }],
        unexpected: "<script>alert(1)</script>"
      }
    })
  });

  assert.equal(result.status, 201);
  assert.equal(result.body.id, "AbCdEfGhIjKlMnOpQrStUv");
  assert.equal(result.body.url, "/i/AbCdEfGhIjKlMnOpQrStUv");
  assert.equal(typeof result.body.expiresAt, "string");
  assert.deepEqual(Object.keys(result.body).sort(), ["expiresAt", "id", "url"]);
  assert.equal(repository.publishes.length, 1);
  assert.equal(repository.publishes[0].invitation.title, "서버 발행 초대장");
  assert.equal(repository.publishes[0].invitation.heroImage.scale, 150);
  assert.equal(repository.publishes[0].invitation.unexpected, undefined);
  assert.equal(JSON.stringify(result.body).includes(TOKEN), false);
});

test("POST accepts a Vercel pre-parsed request body with the same size checks", async () => {
  const repository = new FakeRepository();
  const handler = createTestHandler(repository);

  const result = await callHandler(handler, {
    method: "POST",
    url: "/api/invitations",
    headers: bearerHeaders({ host: "maker.example" }),
    body: { invitation: { title: "Parsed body" } }
  });

  assert.equal(result.status, 201);
  assert.equal(repository.publishes[0].invitation.title, "Parsed body");

  const tooLarge = await callHandler(createTestHandler(new FakeRepository(), { maxPayloadBytes: 120 }), {
    method: "POST",
    url: "/api/invitations",
    headers: bearerHeaders({ host: "maker.example" }),
    body: { invitation: {} }
  });
  assert.equal(tooLarge.status, 413);
});

test("POST rejects invalid credentials, origin, body size, normalized size, and spoofed images", async () => {
  const repository = new FakeRepository();
  const handler = createTestHandler(repository, {
    allowedOrigin: "https://maker.example",
    maxPayloadBytes: 220
  });

  assert.equal((await request(handler, "/api/invitations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ invitation: {} })
  })).status, 401);

  assert.equal((await request(handler, "/api/invitations", {
    method: "POST",
    headers: bearerHeaders({ origin: "https://attacker.example" }),
    body: JSON.stringify({ invitation: {} })
  })).status, 403);

  assert.equal((await request(handler, "/api/invitations", {
    method: "POST",
    headers: bearerHeaders({ "idempotency-key": "not-a-uuid" }),
    body: JSON.stringify({ invitation: {} })
  })).status, 400);

  assert.equal((await request(handler, "/api/invitations", {
    method: "POST",
    headers: bearerHeaders(),
    body: JSON.stringify({ invitation: { title: "x".repeat(240) } })
  })).status, 413);

  assert.equal((await request(handler, "/api/invitations", {
    method: "POST",
    headers: bearerHeaders(),
    body: JSON.stringify({ invitation: {} })
  })).status, 413);

  const imageHandler = createTestHandler(new FakeRepository());
  assert.equal((await request(imageHandler, "/api/invitations", {
    method: "POST",
    headers: bearerHeaders(),
    body: JSON.stringify({ invitation: { heroImage: { src: JPEG_BYTES_AS_PNG } } })
  })).status, 400);

  assert.equal(repository.publishes.length, 0);
});

test("POST rejects malformed invitation shapes instead of silently normalizing them", async () => {
  const handler = createTestHandler(new FakeRepository());
  const requestWith = (invitation) => request(handler, "/api/invitations", {
    method: "POST",
    headers: bearerHeaders(),
    body: JSON.stringify({ invitation })
  });

  assert.equal((await request(handler, "/api/invitations", {
    method: "POST",
    headers: bearerHeaders(),
    body: JSON.stringify({ invitation: [] })
  })).status, 400);
  assert.equal((await requestWith({ title: { text: "wrong" } })).status, 400);
  assert.equal((await requestWith({ items: Array.from({ length: 51 }, (_, index) => ({ id: `course-${index}`, type: "course", place: "A" })) })).status, 400);
  assert.equal((await requestWith({ items: Array.from({ length: 9 }, (_, index) => ({ id: `photo-${index}`, type: "photo", src: PNG_1X1 })) })).status, 400);
  assert.equal((await requestWith({ items: [{ id: "photo-bad", type: "photo", src: PNG_WITH_BAD_PADDING }] })).status, 400);
  assert.equal((await requestWith({ items: [{ id: "bad-type", type: "video", src: PNG_1X1 }] })).status, 400);

  let nested = "leaf";
  for (let index = 0; index < 13; index += 1) nested = { child: nested };
  assert.equal((await requestWith({ title: "Nested", extra: nested })).status, 400);
});

test("POST accepts the complete current app invitation field shape", async () => {
  const repository = new FakeRepository();
  const result = await request(createTestHandler(repository), "/api/invitations", {
    method: "POST",
    headers: bearerHeaders(),
    body: JSON.stringify({
      invitation: {
        templateId: "royal",
        heroImage: null,
        layoutFamily: "romantic-story",
        introEffect: "none",
        particleEffect: "none",
        particleScale: "100",
        particleAmount: "100",
        englishFont: "cormorant-garamond",
        koreanFont: "gowun-batang",
        naverMapClientId: "",
        title: "앱 필드",
        subtitle: "현재 제작기",
        dateLabel: "2026.09.12",
        host: "From. Rin",
        location: "서울",
        mapUrl: "https://map.naver.com/",
        mapEnabled: "on",
        mapLatitude: "37.1",
        mapLongitude: "127.1",
        mapZoom: "16",
        message: "초대합니다",
        items: [
          { id: "course-1", type: "course", time: "14:00", label: "MEET", place: "서울", note: "만나요", mapEnabled: false, mapLatitude: null, mapLongitude: null, mapZoom: "16", mapUrl: "" },
          { id: "photo-1", type: "photo", src: PNG_1X1, alt: "사진", caption: "캡션" },
          { id: "notice-1", type: "notice", heading: "안내", body: "내용" },
          { id: "profile-1", type: "profile", name: "Rin", role: "Host", description: "설명" },
          { id: "link-1", type: "link", label: "연락", value: "문자", url: "sms:01012345678" }
        ]
      }
    })
  });

  assert.equal(result.status, 201);
  assert.equal(repository.publishes[0].invitation.items.length, 5);
});

test("POST accepts a valid normalized fifty-course app payload", async () => {
  const repository = new FakeRepository();
  const invitation = normalizeInvitation({
    title: "최대 일정 초대장",
    templateId: "royal",
    items: Array.from({ length: 50 }, (_, index) => ({
      id: `course-${index}`,
      type: "course",
      time: "14:00",
      label: "MEET",
      place: `장소 ${index}`,
      note: "정상 일정",
      mapUrl: "",
      mapEnabled: false,
      mapLatitude: null,
      mapLongitude: null,
      mapZoom: 16
    }))
  });

  const result = await request(createTestHandler(repository), "/api/invitations", {
    method: "POST",
    headers: bearerHeaders(),
    body: JSON.stringify({ invitation })
  });

  assert.equal(result.status, 201);
  assert.equal(repository.publishes[0].invitation.items.length, 50);
});

test("POST maps repository replay, quota, and availability failures to stable API errors", async () => {
  const cases = [
    ["IDEMPOTENCY_CONFLICT", 409],
    ["RATE_LIMIT", 429],
    ["TOTAL_DAILY_LIMIT", 429],
    ["LIFETIME_LIMIT", 429],
    ["REPOSITORY_UNAVAILABLE", 503]
  ];

  for (const [code, status] of cases) {
    const repository = new FakeRepository();
    repository.nextError = Object.assign(new Error(code), { code });
    const result = await request(createTestHandler(repository), "/api/invitations", {
      method: "POST",
      headers: bearerHeaders(),
      body: JSON.stringify({ invitation: { title: code } })
    });
    assert.equal(result.status, status, code);
    assert.equal(result.body.error.code, code);
  }

  assert.equal((await request(createTestHandler(null), "/api/invitations", {
    method: "POST",
    headers: bearerHeaders(),
    body: JSON.stringify({ invitation: {} })
  })).status, 503);
});

test("GET never exposes secret hashes and denies expired records immediately", async () => {
  const repository = new FakeRepository();
  const liveHandler = createTestHandler(repository);
  await request(liveHandler, "/api/invitations", {
    method: "POST",
    headers: bearerHeaders(),
    body: JSON.stringify({ invitation: { title: "공개 초대장" } })
  });

  const live = await request(liveHandler, "/api/invitations/AbCdEfGhIjKlMnOpQrStUv");
  assert.equal(live.status, 200);
  assert.equal(live.body.invitation.title, "공개 초대장");
  assert.equal(typeof live.body.expiresAt, "string");
  assert.equal(JSON.stringify(live.body).includes("tokenHash"), false);
  assert.equal(JSON.stringify(live.body).includes(TOKEN), false);
  assert.equal(live.headers.get("cache-control"), "no-store");
  assert.equal(live.headers.get("x-robots-tag"), "noindex");
  assert.equal(live.headers.get("referrer-policy"), "no-referrer");

  repository.records.get("AbCdEfGhIjKlMnOpQrStUv").expiresAt = new Date(Date.now() - 1000).toISOString();
  const expired = await request(liveHandler, "/api/invitations/AbCdEfGhIjKlMnOpQrStUv");
  assert.equal(expired.status, 410);
});

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const PUBLISHED_AT = new Date("2026-01-01T00:00:00.000Z");
const at = (days, hours = 0) => new Date(PUBLISHED_AT.getTime() + days * DAY_MS + hours * HOUR_MS);

// Expiry behaviour is time dependent; inject a clock instead of sleeping.
const createClockedHandler = (repository, config = {}) => {
  const clock = { now: PUBLISHED_AT };
  return {
    clock,
    handler: createTestHandler(repository, { clock: () => clock.now, ...config })
  };
};

const publishOnce = (handler, title = "만료 정책") => request(handler, "/api/invitations", {
  method: "POST",
  headers: bearerHeaders(),
  body: JSON.stringify({ invitation: { title } })
});

test("publishing stamps an expiry one idle window ahead of the publish time", async () => {
  const repository = new FakeRepository();
  const { handler } = createClockedHandler(repository);

  const result = await publishOnce(handler);

  assert.equal(result.status, 201);
  assert.equal(result.body.expiresAt, at(7).toISOString());
  assert.equal(repository.publishes[0].expiresAt, at(7).toISOString());
  assert.equal(repository.records.get(result.body.id).expiresAt, at(7).toISOString());
});

test("a public read slides the expiry forward and throttles repeated writes", async () => {
  const repository = new FakeRepository();
  const { clock, handler } = createClockedHandler(repository);
  const published = await publishOnce(handler);
  const publicPath = `/api/invitations/${published.body.id}`;

  clock.now = at(5);
  const viewed = await request(handler, publicPath);
  assert.equal(viewed.status, 200);
  assert.equal(viewed.body.invitation.title, "만료 정책");
  assert.equal(viewed.body.expiresAt, at(12).toISOString());
  assert.equal(repository.records.get(published.body.id).expiresAt, at(12).toISOString());
  assert.equal(repository.refreshes.length, 1);

  // Same instant, and again three hours later: inside the refresh throttle, so
  // the read never reaches the database with a write.
  await request(handler, publicPath);
  clock.now = at(5, 3);
  const throttled = await request(handler, publicPath);
  assert.equal(throttled.body.expiresAt, at(12).toISOString());
  assert.equal(repository.refreshes.length, 1);

  clock.now = at(5, 7);
  const slid = await request(handler, publicPath);
  assert.equal(slid.body.expiresAt, at(12, 7).toISOString());
  assert.equal(repository.refreshes.length, 2);
});

test("the sliding expiry never exceeds the publication's hard lifetime ceiling", async () => {
  const repository = new FakeRepository();
  const { clock, handler } = createClockedHandler(repository);
  const published = await publishOnce(handler);
  const publicPath = `/api/invitations/${published.body.id}`;
  const stored = repository.records.get(published.body.id);

  // Kept alive by steady viewing: each read slides the window, until the hard
  // ceiling at createdAt + 30 days stops it.
  for (const [day, expected] of [[5, 12], [11, 18], [17, 24], [23, 30]]) {
    clock.now = at(day);
    const viewed = await request(handler, publicPath);
    assert.equal(viewed.status, 200, `day ${day}`);
    assert.equal(viewed.body.expiresAt, at(expected).toISOString(), `day ${day}`);
  }
  assert.equal(repository.refreshes.length, 4);

  clock.now = at(26);
  const capped = await request(handler, publicPath);
  assert.equal(capped.status, 200);
  assert.equal(capped.body.expiresAt, at(30).toISOString());

  clock.now = at(29);
  const stillCapped = await request(handler, publicPath);
  assert.equal(stillCapped.body.expiresAt, at(30).toISOString());
  assert.equal(repository.refreshes.length, 4, "a capped record stops generating writes");
  assert.equal(stored.createdAt.toISOString(), PUBLISHED_AT.toISOString());

  // Day 30 is the end of the line no matter how often it was viewed.
  clock.now = at(30, 1);
  assert.equal((await request(handler, publicPath)).status, 410);

  // The ceiling comes from the stored createdAt. A record already past it is
  // still served, and the read never shortens it.
  const legacy = new FakeRepository();
  const legacyHandler = createClockedHandler(legacy);
  const legacyPublished = await publishOnce(legacyHandler.handler);
  const legacyRecord = legacy.records.get(legacyPublished.body.id);
  legacyRecord.createdAt = new Date(PUBLISHED_AT.getTime() - 100 * DAY_MS);
  legacyRecord.expiresAt = at(5).toISOString();
  legacy.refreshes.length = 0;

  const served = await request(legacyHandler.handler, `/api/invitations/${legacyPublished.body.id}`);
  assert.equal(served.status, 200);
  assert.equal(served.body.expiresAt, at(5).toISOString());
  assert.equal(legacy.refreshes.length, 0);
});

test("an admin read never extends a publication's expiry", async () => {
  const calls = [];
  const record = {
    id: "AbCdEfGhIjKlMnOpQrStUv",
    invitation: { title: "관리자 열람" },
    createdAt: PUBLISHED_AT,
    expiresAt: at(7).toISOString(),
    expiresAtDate: at(7)
  };
  const collection = {
    async createIndex() {},
    async findOne(filter) {
      calls.push({ findOne: filter });
      return record;
    },
    async updateOne(...args) {
      calls.push({ updateOne: args });
      throw new Error("admin reads must not write");
    },
    async findOneAndUpdate(...args) {
      calls.push({ findOneAndUpdate: args });
      throw new Error("admin reads must not write");
    }
  };
  const repository = createAdminMongoPublications({
    uri: "mongodb://unused",
    dbName: "admin-expiry-test",
    collectionFactory: async () => collection
  });

  const viewed = await repository.getAdmin(record.id);

  assert.equal(viewed.expiresAt, at(7).toISOString());
  assert.equal(record.expiresAt, at(7).toISOString());
  assert.equal(record.expiresAtDate.toISOString(), at(7).toISOString());
  assert.equal(typeof repository.refreshExpiry, "undefined");
  assert.equal(calls.filter((call) => call.updateOne || call.findOneAndUpdate).length, 0);
});

test("a store that hides expired publications turns the public read into a plain miss", async () => {
  const repository = new ExpiryEnforcingRepository();
  const { clock, handler } = createClockedHandler(repository);
  const published = await publishOnce(handler, "만료 후 조회");
  const publicPath = `/api/invitations/${published.body.id}`;
  const stored = repository.records.get(published.body.id);

  clock.now = at(5);
  const live = await request(handler, publicPath);
  assert.equal(live.status, 200);
  assert.equal(live.body.invitation.title, "만료 후 조회");
  assert.equal(live.body.expiresAt, at(12).toISOString());
  assert.equal(repository.refreshes.length, 1, "a live read still slides the window");

  // Nothing deletes the record any more, so an expired read must be denied by
  // the read itself - and must not push the expiry forward on its way out.
  clock.now = at(12, 1);
  const expired = await request(handler, publicPath);
  assert.equal(expired.status, 404);
  assert.equal(expired.body.error.code, "NOT_FOUND");
  assert.ok(repository.records.has(published.body.id), "the record is hidden, not deleted");
  assert.equal(stored.expiresAt, at(12).toISOString());
  assert.equal(repository.refreshes.length, 1, "an expired read never reaches the refresh path");

  // Even called directly, the refresh refuses to resurrect a dead record.
  assert.equal(await repository.refreshExpiry({
    id: published.body.id,
    expiresAt: at(19).toISOString(),
    now: clock.now
  }), false);
  assert.equal(stored.expiresAt, at(12).toISOString());
});

test("a failed expiry refresh still serves the invitation", async () => {
  const repository = new FakeRepository();
  const { clock, handler } = createClockedHandler(repository);
  const published = await publishOnce(handler);

  repository.refreshError = Object.assign(new Error("write failed"), { code: "REPOSITORY_UNAVAILABLE" });
  clock.now = at(5);
  const viewed = await request(handler, `/api/invitations/${published.body.id}`);

  assert.equal(viewed.status, 200);
  assert.equal(viewed.body.invitation.title, "만료 정책");
  assert.equal(viewed.body.expiresAt, at(7).toISOString());
  assert.equal(repository.refreshes.length, 1);
  assert.equal(repository.records.get(published.body.id).expiresAt, at(7).toISOString());
});

test("DELETE requires the management token and removes only matching records", async () => {
  const repository = new FakeRepository();
  const handler = createTestHandler(repository);
  await request(handler, "/api/invitations", {
    method: "POST",
    headers: bearerHeaders(),
    body: JSON.stringify({ invitation: { title: "삭제 테스트" } })
  });

  assert.equal((await request(handler, "/api/invitations/AbCdEfGhIjKlMnOpQrStUv", {
    method: "DELETE"
  })).status, 401);

  assert.equal((await request(handler, "/api/invitations/AbCdEfGhIjKlMnOpQrStUv", {
    method: "DELETE",
    headers: { authorization: `Bearer ${OTHER_TOKEN}` }
  })).status, 403);

  assert.equal((await request(handler, "/api/invitations/AbCdEfGhIjKlMnOpQrStUv", {
    method: "DELETE",
    headers: { authorization: `Bearer ${TOKEN}` }
  })).status, 204);

  assert.equal((await request(handler, "/api/invitations/AbCdEfGhIjKlMnOpQrStUv", {
    method: "DELETE",
    headers: { authorization: `Bearer ${TOKEN}` }
  })).status, 204);

  assert.equal((await request(handler, "/api/invitations/AbCdEfGhIjKlMnOpQrStUv")).status, 404);
});

test("static server allowlist serves public files and blocks traversal plus environment files", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "invitation-static-"));
  fs.writeFileSync(path.join(root, "index.html"), "<!doctype html><title>Maker</title>");
  fs.writeFileSync(path.join(root, "0912.html"), "<!doctype html><title>Personal</title>");
  fs.writeFileSync(path.join(root, ".env"), "MONGODB_URI=secret");
  fs.writeFileSync(path.join(root, "invitation-data.json"), "{}");
  fs.mkdirSync(path.join(root, "assets"));
  fs.writeFileSync(path.join(root, "assets", "app.js"), "window.ok = true;");
  const handler = createTestHandler(new FakeRepository(), { staticRoot: root });

  assert.equal((await request(handler, "/")).status, 200);
  assert.equal((await request(handler, "/0912.html")).status, 200);
  assert.equal((await request(handler, "/assets/app.js")).status, 200);
  assert.equal((await request(handler, "/invitation-data.json")).status, 200);
  assert.equal((await request(handler, "/.env")).status, 404);
  assert.equal((await request(handler, "/%2e%2e/.env")).status, 404);
  assert.equal((await request(handler, "/docs/superpowers/specs/2026-09-10-anonymous-publishing-design.md")).status, 404);
});

test("unmatched GET paths render the designed 404 page while API 404s stay JSON", async () => {
  const repoRoot = path.resolve(__dirname, "..");
  const handler = createTestHandler(new FakeRepository(), { staticRoot: repoRoot });

  const page = await request(handler, "/4asd");
  assert.equal(page.status, 404);
  assert.match(page.headers.get("content-type") || "", /text\/html/);
  assert.match(page.body, /<!doctype html>/i);
  assert.match(page.body, /404/);

  const apiMiss = await request(handler, "/api/invitations/nonexistentnonexisten1");
  assert.equal(apiMiss.status, 404);
  assert.match(apiMiss.headers.get("content-type") || "", /application\/json/);
  assert.equal(apiMiss.body.error.code, "NOT_FOUND");

  const apiUnknown = await request(handler, "/api/does-not-exist");
  assert.equal(apiUnknown.status, 404);
  assert.match(apiUnknown.headers.get("content-type") || "", /application\/json/);
  assert.equal(apiUnknown.body.error.code, "NOT_FOUND");

  const posted = await request(handler, "/4asd", { method: "POST" });
  assert.equal(posted.status, 404);
  assert.match(posted.headers.get("content-type") || "", /application\/json/);
});

test("Mongo repository publishes, replays idempotently, enforces quotas, and deletes by token", {
  skip: !process.env.MONGODB_URI && "Set MONGODB_URI for real Mongo integration"
}, async () => {
  const databaseName = `publishing_test_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const repository = createMongoPublicationsRepository({
    uri: process.env.MONGODB_URI,
    dbName: databaseName,
    rateLimitPerHour: 20,
    totalDailyLimit: 20,
    lifetimeLimit: 20
  });
  // These fixtures publish at a fixed instant, so reads have to be judged
  // against that instant too: the repository hides records past their expiry.
  const whilePublished = { now: new Date("2026-09-10T12:00:00.000Z") };

  try {
    const first = await repository.publish({
      id: "1111111111111111111111",
      invitation: { title: "Mongo invite" },
      tokenHash: "token-a",
      idempotencyKeyHash: "idem-a",
      contentHash: "content-a",
      clientKeyHash: "client-a",
      now: new Date("2026-09-10T00:00:00.000Z"),
      expiresAt: "2026-09-11T00:00:00.000Z"
    });
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const counterDocs = await client.db(databaseName).collection("publishing_counters").find({}).toArray();
    await client.close();
    assert.equal(counterDocs.filter((doc) => doc.key.startsWith("hour:") && doc.expiresAt instanceof Date).length, 1);
    assert.equal(counterDocs.filter((doc) => doc.key.startsWith("day:") && doc.expiresAt instanceof Date).length, 1);
    assert.equal(counterDocs.filter((doc) => doc.key === "lifetime" && doc.expiresAt).length, 0);

    const replay = await repository.publish({
      id: "2222222222222222222222",
      invitation: { title: "Mongo invite" },
      tokenHash: "token-a",
      idempotencyKeyHash: "idem-a",
      contentHash: "content-a",
      clientKeyHash: "client-a",
      now: new Date("2026-09-10T00:01:00.000Z"),
      expiresAt: "2026-09-11T00:01:00.000Z"
    });
    const racingReplays = await Promise.all([
      repository.publish({
        id: "5555555555555555555555",
        invitation: { title: "Race invite" },
        tokenHash: "race-token",
        idempotencyKeyHash: "race-idem",
        contentHash: "race-content",
        clientKeyHash: "race-client",
        now: new Date("2026-09-10T00:01:30.000Z"),
        expiresAt: "2026-09-11T00:01:30.000Z"
      }),
      repository.publish({
        id: "6666666666666666666666",
        invitation: { title: "Race invite" },
        tokenHash: "race-token",
        idempotencyKeyHash: "race-idem",
        contentHash: "race-content",
        clientKeyHash: "race-client",
        now: new Date("2026-09-10T00:01:30.000Z"),
        expiresAt: "2026-09-11T00:01:30.000Z"
      })
    ]);
    assert.equal(racingReplays[0].id, racingReplays[1].id);
    const collision = await repository.publish({
      id: first.id,
      createId: () => "7777777777777777777777",
      invitation: { title: "Collision invite" },
      tokenHash: "collision-token",
      idempotencyKeyHash: "collision-idem",
      contentHash: "collision-content",
      clientKeyHash: "collision-client",
      now: new Date("2026-09-10T00:01:40.000Z"),
      expiresAt: "2026-09-11T00:01:40.000Z"
    });
    assert.equal(collision.id, "7777777777777777777777");

    assert.equal(first.id, "1111111111111111111111");
    assert.equal(replay.id, first.id);
    assert.equal((await repository.get(first.id, whilePublished)).invitation.title, "Mongo invite");

    await repository.close();
    const restartedRepository = createMongoPublicationsRepository({
      uri: process.env.MONGODB_URI,
      dbName: databaseName,
      rateLimitPerHour: 20,
      totalDailyLimit: 20,
      lifetimeLimit: 20
    });
    assert.equal((await restartedRepository.get(first.id, whilePublished)).invitation.title, "Mongo invite");
    await restartedRepository.close();

    await assert.rejects(() => repository.publish({
      id: "3333333333333333333333",
      invitation: { title: "Changed" },
      tokenHash: "token-a",
      idempotencyKeyHash: "idem-a",
      contentHash: "content-b",
      clientKeyHash: "client-a",
      now: new Date("2026-09-10T00:02:00.000Z"),
      expiresAt: "2026-09-11T00:02:00.000Z"
    }), /IDEMPOTENCY_CONFLICT/);

    const quotaRepository = createMongoPublicationsRepository({
      uri: process.env.MONGODB_URI,
      dbName: databaseName,
      collectionName: "quota_invitations",
      countersCollectionName: "quota_counters",
      rateLimitPerHour: 10,
      totalDailyLimit: 2,
      lifetimeLimit: 2
    });
    const concurrent = await Promise.allSettled([0, 1, 2].map((index) => quotaRepository.publish({
      id: `quota00000000000000000${index}`,
      invitation: { title: `Quota ${index}` },
      tokenHash: `token-${index}`,
      idempotencyKeyHash: `idem-${index}`,
      contentHash: `content-${index}`,
      clientKeyHash: `client-${index}`,
      now: new Date("2026-09-10T00:03:00.000Z"),
      expiresAt: "2026-09-11T00:03:00.000Z"
    })));
    assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 2);
    assert.equal(concurrent.filter((result) => result.status === "rejected").length, 1);
    await quotaRepository.close();

    const expiredRepository = createMongoPublicationsRepository({
      uri: process.env.MONGODB_URI,
      dbName: databaseName,
      rateLimitPerHour: 10,
      totalDailyLimit: 10,
      lifetimeLimit: 10
    });
    await expiredRepository.publish({
      id: "4444444444444444444444",
      invitation: { title: "Expired Mongo invite" },
      tokenHash: "expired-token",
      idempotencyKeyHash: "expired-idem",
      contentHash: "expired-content",
      clientKeyHash: "expired-client",
      now: new Date("2026-09-10T00:04:00.000Z"),
      expiresAt: "2026-09-09T00:00:00.000Z"
    });
    const expiredResponse = await request(createTestHandler(expiredRepository), "/api/invitations/4444444444444444444444");
    assert.equal(expiredResponse.status, 404);
    assert.equal(expiredResponse.body.error.code, "NOT_FOUND");
    assert.equal(await expiredRepository.get("4444444444444444444444"), null);
    const survivorClient = new MongoClient(process.env.MONGODB_URI);
    await survivorClient.connect();
    const survivor = await survivorClient.db(databaseName)
      .collection("published_invitations")
      .findOne({ id: "4444444444444444444444" });
    await survivorClient.close();
    assert.ok(survivor, "the expired record is hidden by the read, not deleted by the database");
    await expiredRepository.close();

    assert.equal(await repository.remove({ id: first.id, tokenHash: "wrong" }), false);
    assert.equal(await repository.remove({ id: first.id, tokenHash: "token-a" }), true);
    assert.equal(await repository.get(first.id, whilePublished), null);
  } finally {
    await repository.dropDatabase();
    await repository.close();
  }
});

test("Mongo hides expired publications from the public read, keeps them for the operator, and never revives them", {
  skip: !process.env.MONGODB_URI && "Set MONGODB_URI for real Mongo integration"
}, async () => {
  const databaseName = `publishing_expiry_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const repository = createMongoPublicationsRepository({
    uri: process.env.MONGODB_URI,
    dbName: databaseName,
    rateLimitPerHour: 20,
    totalDailyLimit: 20,
    lifetimeLimit: 20
  });
  const admin = createAdminMongoPublications({
    uri: process.env.MONGODB_URI,
    dbName: databaseName
  });
  const client = new MongoClient(process.env.MONGODB_URI);
  const id = "7777777777777777777777";

  try {
    await repository.publish({
      id,
      invitation: { title: "만료 정책" },
      tokenHash: "ttl-token",
      idempotencyKeyHash: "ttl-idem",
      contentHash: "ttl-content",
      clientKeyHash: "ttl-client",
      now: PUBLISHED_AT,
      expiresAt: at(7).toISOString()
    });

    await client.connect();
    const publications = () => client.db(databaseName).collection("published_invitations");
    const raw = () => publications().findOne({ id });

    const stored = await raw();
    assert.ok(stored.expiresAtDate instanceof Date, "the expiry marker has to be a real Date to be queryable");
    assert.equal(stored.expiresAtDate.toISOString(), stored.expiresAt);

    // `expiresAtDate` is a marker the batch job scans, not a deletion trigger.
    const expiryIndex = (await publications().indexes())
      .find((index) => index.key.expiresAtDate === 1 && Object.keys(index.key).length === 1);
    assert.ok(expiryIndex, "the future batch job needs an index on expiresAtDate");
    assert.equal(expiryIndex.expireAfterSeconds, undefined, "MongoDB must not delete publications");

    // Quota buckets are ephemeral bookkeeping and keep expiring on their own.
    const counterIndexes = await client.db(databaseName).collection("publishing_counters").indexes();
    assert.ok(counterIndexes.some((index) => index.key.expiresAt === 1 && index.expireAfterSeconds === 0));

    // Live: reads normally, and the read still slides the window forward.
    const live = await repository.get(id, { now: at(5) });
    assert.equal(live.invitation.title, "만료 정책");
    assert.equal(live.createdAt.toISOString(), PUBLISHED_AT.toISOString());
    assert.equal(await repository.refreshExpiry({ id, expiresAt: at(12).toISOString(), now: at(5) }), true);
    assert.equal((await raw()).expiresAt, at(12).toISOString());
    assert.equal((await raw()).expiresAtDate.toISOString(), at(12).toISOString());

    // Monotonic: a slower concurrent read can never pull the expiry backwards.
    assert.equal(await repository.refreshExpiry({ id, expiresAt: at(9).toISOString(), now: at(5) }), false);
    assert.equal((await raw()).expiresAt, at(12).toISOString());
    assert.equal(await repository.refreshExpiry({ id: "missing", expiresAt: at(12).toISOString(), now: at(5) }), false);

    // Past its expiry: gone from the public read, and not extended by it.
    assert.equal(await repository.get(id, { now: at(12, 1) }), null);
    assert.equal(await repository.refreshExpiry({ id, expiresAt: at(19).toISOString(), now: at(12, 1) }), false);
    assert.equal((await raw()).expiresAt, at(12).toISOString());

    // End to end, the public API answers exactly as it did when a TTL index had
    // already removed the document.
    const { clock, handler } = createClockedHandler(repository);
    clock.now = at(12, 1);
    const expired = await request(handler, `/api/invitations/${id}`);
    assert.equal(expired.status, 404);
    assert.equal(expired.body.error.code, "NOT_FOUND");
    assert.equal((await raw()).expiresAt, at(12).toISOString(), "the public read left the expiry alone");

    // The record is still there: the operator can see it and clean it up.
    assert.ok(await raw());
    const viewed = await admin.getAdmin(id);
    assert.equal(viewed.invitation.title, "만료 정책");
    assert.equal(viewed.expiresAt, at(12).toISOString());
    assert.equal((await admin.list({ query: id })).items.length, 1);
  } finally {
    await client.close();
    await admin.close();
    await repository.dropDatabase();
    await repository.close();
  }
});

test("Mongo keeps a legacy record without an expiry marker readable and refreshable", {
  skip: !process.env.MONGODB_URI && "Set MONGODB_URI for real Mongo integration"
}, async () => {
  const databaseName = `publishing_legacy_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const repository = createMongoPublicationsRepository({
    uri: process.env.MONGODB_URI,
    dbName: databaseName,
    rateLimitPerHour: 20,
    totalDailyLimit: 20,
    lifetimeLimit: 20
  });
  const id = "8888888888888888888888";

  try {
    await repository.publish({
      id,
      invitation: { title: "정책 이전 발행" },
      tokenHash: "legacy-token",
      idempotencyKeyHash: "legacy-idem",
      contentHash: "legacy-content",
      clientKeyHash: "legacy-client",
      now: PUBLISHED_AT,
      expiresAt: null
    });

    assert.equal((await repository.get(id, { now: at(400) })).invitation.title, "정책 이전 발행");
    assert.equal(await repository.refreshExpiry({ id, expiresAt: at(407).toISOString(), now: at(400) }), true);
    assert.equal((await repository.get(id, { now: at(400) })).expiresAt, at(407).toISOString());
  } finally {
    await repository.dropDatabase();
    await repository.close();
  }
});
