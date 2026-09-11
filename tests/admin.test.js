const test = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const { readAdminConfigFromEnv, passwordMatches } = require("../admin/config.cjs");
const { createHandler, COOKIE } = require("../admin/http.cjs");
const { createAdminMongoPublications } = require("../admin/storage/mongo-publications.cjs");
const { createSessionStore } = require("../admin/session-store.cjs");

const call = async (handler, { method = "GET", url = "/", headers = {}, body } = {}) => {
  const req = new Readable({ read() { this.push(null); } });
  req.method = method; req.url = url; req.headers = headers; req.body = body;
  req.socket = { encrypted: false, remoteAddress: "127.0.0.1" };
  const res = { status: 0, headers: {}, payload: "", writeHead(status, headers) { this.status = status; this.headers = headers; }, end(chunk = "") { this.payload += chunk; this.resolve(); } };
  await new Promise((resolve) => { res.resolve = resolve; handler(req, res); });
  return { status: res.status, headers: res.headers, body: res.payload ? JSON.parse(res.payload) : null };
};

class FakeAdminRepository {
  constructor() {
    this.items = [1, 2, 3].map((number) => ({ id: `AbCdEfGhIjKlMnOpQrStU${number}`, title: `초대장 ${number}`, createdAt: new Date(2026, 8, number), expiresAt: null, invitation: { title: `초대장 ${number}`, items: [] } }));
  }
  async list({ page, pageSize, query }) {
    const filtered = query ? this.items.filter((item) => item.id.includes(query) || item.title.includes(query)) : this.items;
    const start = (page - 1) * pageSize;
    return { items: filtered.slice(start, start + pageSize), pagination: { page, pageSize, totalItems: filtered.length, totalPages: Math.ceil(filtered.length / pageSize) } };
  }
  async getAdmin(id) { return this.items.find((item) => item.id === id) || null; }
  async revoke(id) { const before = this.items.length; this.items = this.items.filter((item) => item.id !== id); return this.items.length !== before; }
}

const make = (repository = new FakeAdminRepository()) => {
  const sessionStore = createSessionStore({ ttlMs: 60_000 });
  return { repository, sessionStore, handler: createHandler({ repository, sessionStore, staticRoot: "/tmp/does-not-exist", config: { adminPassword: "secret", pageSize: 2, publicBaseUrl: "https://example.test", loginRateLimit: { windowMs: 60_000, maxAttempts: 3 } } }) };
};

test("admin session store expires and validates CSRF", () => {
  let time = 1000;
  const store = createSessionStore({ ttlMs: 10, now: () => time });
  const issued = store.create();
  assert.ok(store.get(issued.sessionToken));
  assert.equal(store.validCsrf(issued.sessionToken, issued.csrfToken), true);
  assert.equal(store.validCsrf(issued.sessionToken, "wrong"), false);
  time = 1011;
  assert.equal(store.get(issued.sessionToken), null);
});

test("admin login, paginated listing, detail, and csrf-protected revoke", async () => {
  const setup = make();
  const failed = await call(setup.handler, { method: "POST", url: "/admin/api/login", body: { password: "wrong" } });
  assert.equal(failed.status, 401);
  const login = await call(setup.handler, { method: "POST", url: "/admin/api/login", body: { password: "secret" } });
  assert.equal(login.status, 200);
  assert.ok(login.headers["set-cookie"]);
  const cookie = login.headers["set-cookie"].split(";")[0];
  const csrf = login.body.csrfToken;
  const list = await call(setup.handler, { url: "/admin/api/publications?page=2&pageSize=2", headers: { cookie } });
  assert.equal(list.status, 200);
  assert.equal(list.body.items.length, 1);
  assert.deepEqual(list.body.pagination, { page: 2, pageSize: 2, totalItems: 3, totalPages: 2 });
  assert.equal(list.body.items[0].publicUrl, "https://example.test/i/AbCdEfGhIjKlMnOpQrStU3");
  assert.equal("invitation" in list.body.items[0], false);
  const titleSearch = await call(setup.handler, { url: "/admin/api/publications?q=%EC%B4%88%EB%8C%80%EC%9E%A5%201", headers: { cookie } });
  assert.equal(titleSearch.body.pagination.totalItems, 1);
  const detail = await call(setup.handler, { url: "/admin/api/publications/AbCdEfGhIjKlMnOpQrStU1", headers: { cookie } });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.invitation.title, "초대장 1");
  const denied = await call(setup.handler, { method: "POST", url: "/admin/api/publications/AbCdEfGhIjKlMnOpQrStU1/revoke", headers: { cookie } });
  assert.equal(denied.status, 403);
  const revoked = await call(setup.handler, { method: "POST", url: "/admin/api/publications/AbCdEfGhIjKlMnOpQrStU1/revoke", headers: { cookie, "x-admin-csrf": csrf } });
  assert.equal(revoked.status, 204);
  assert.equal(setup.repository.items.length, 2);
  const logoutDenied = await call(setup.handler, { method: "POST", url: "/admin/api/logout", headers: { cookie } });
  assert.equal(logoutDenied.status, 403);
  const logout = await call(setup.handler, { method: "POST", url: "/admin/api/logout", headers: { cookie, "x-admin-csrf": csrf } });
  assert.equal(logout.status, 204);
  assert.match(logout.headers["set-cookie"], new RegExp(`^${COOKIE}=`));
});

test("admin routes require a session", async () => {
  const { handler } = make();
  const response = await call(handler, { url: "/admin/api/publications" });
  assert.equal(response.status, 401);
});

test("admin session API returns a new usable CSRF token without invalidating existing tabs", async () => {
  const setup = make();
  const login = await call(setup.handler, { method: "POST", url: "/admin/api/login", body: { password: "secret" } });
  const cookie = login.headers["set-cookie"].split(";")[0];
  const firstCsrf = login.body.csrfToken;

  const session = await call(setup.handler, { url: "/admin/api/session", headers: { cookie } });
  assert.equal(session.status, 200);
  assert.equal(session.body.authenticated, true);
  assert.equal(typeof session.body.csrfToken, "string");
  assert.notEqual(session.body.csrfToken, firstCsrf);

  const firstTab = await call(setup.handler, { method: "POST", url: "/admin/api/publications/AbCdEfGhIjKlMnOpQrStU1/revoke", headers: { cookie, "x-admin-csrf": firstCsrf } });
  assert.equal(firstTab.status, 204);
  const secondTab = await call(setup.handler, { method: "POST", url: "/admin/api/publications/AbCdEfGhIjKlMnOpQrStU2/revoke", headers: { cookie, "x-admin-csrf": session.body.csrfToken } });
  assert.equal(secondTab.status, 204);
});

test("admin malformed cookies fail closed without crashing", async () => {
  const { handler } = make();
  const response = await call(handler, { url: "/admin/api/publications", headers: { cookie: `${COOKIE}=%E0%A4%A` } });
  assert.equal(response.status, 401);
  assert.equal(response.body.error, "ADMIN_AUTH_REQUIRED");
});

test("admin password and login input fail closed with bounded throttling", async () => {
  assert.equal(passwordMatches("", ""), false);
  assert.equal(passwordMatches("secret", ""), false);

  const { handler } = make();
  for (let index = 0; index < 3; index += 1) {
    const failed = await call(handler, { method: "POST", url: "/admin/api/login", body: { password: `bad-${index}` } });
    assert.equal(failed.status, 401);
  }
  const limited = await call(handler, { method: "POST", url: "/admin/api/login", body: { password: "secret" } });
  assert.equal(limited.status, 429);
});

test("admin config parses strict bounded inputs and validates public base URL", () => {
  const config = readAdminConfigFromEnv({
    ADMIN_PASSWORD: "secret",
    ADMIN_PORT: "70000",
    ADMIN_SESSION_TTL_MS: "-1",
    ADMIN_PAGE_SIZE: "10000",
    ADMIN_LOGIN_WINDOW_MS: "1",
    ADMIN_LOGIN_MAX_ATTEMPTS: "0",
    PUBLIC_BASE_URL: "ftp://example.test"
  });

  assert.equal(config.adminPassword, "secret");
  assert.equal(config.port, 4174);
  assert.equal(config.sessionTtlMs, 8 * 60 * 60 * 1000);
  assert.equal(config.pageSize, 100);
  assert.deepEqual(config.loginRateLimit, { windowMs: 60_000, maxAttempts: 5 });
  assert.equal(config.publicBaseUrl, "http://127.0.0.1:4173");
});

test("admin mongo publication list counts, clamps, sorts, searches safely, and excludes photo payloads", async () => {
  const calls = [];
  const records = [
    { id: "two", invitation: { title: "초대장.*", photos: ["big"] }, createdAt: new Date("2026-09-02T00:00:00.000Z"), expiresAt: null, _id: 2 },
    { id: "one", invitation: { title: "초대장 1", photos: ["big"] }, createdAt: new Date("2026-09-01T00:00:00.000Z"), expiresAt: "2026-10-01", _id: 1 }
  ];
  const collection = {
    async createIndex() {},
    async countDocuments(filter) {
      calls.push({ countFilter: filter });
      return records.length;
    },
    find(filter, options) {
      calls.push({ findFilter: filter, projection: options?.projection });
      return {
        sort(sort) {
          calls.push({ sort });
          return this;
        },
        skip(skip) {
          calls.push({ skip });
          return this;
        },
        limit(limit) {
          calls.push({ limit });
          return this;
        },
        async toArray() {
          return records.slice(1);
        }
      };
    }
  };
  const repository = createAdminMongoPublications({
    uri: "mongodb://unused",
    dbName: "admin-test",
    collectionFactory: async () => collection
  });

  const result = await repository.list({ page: Number.MAX_SAFE_INTEGER, pageSize: 1, query: "초대장.*" });

  assert.deepEqual(result.pagination, { page: 2, pageSize: 1, totalItems: 2, totalPages: 2 });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].id, "one");
  assert.equal(result.items[0].title, "초대장 1");
  assert.equal(result.items[0].invitation, undefined);
  assert.deepEqual(calls.find((call) => call.sort).sort, { createdAt: -1, _id: -1, id: 1 });
  assert.deepEqual(calls.find((call) => call.skip).skip, 1);
  assert.deepEqual(calls.find((call) => call.projection).projection, {
    id: 1,
    "invitation.title": 1,
    createdAt: 1,
    expiresAt: 1
  });
  assert.deepEqual(calls.find((call) => call.findFilter).findFilter, {
    $or: [
      { id: { $regex: "초대장\\.\\*", $options: "i" } },
      { "invitation.title": { $regex: "초대장\\.\\*", $options: "i" } }
    ]
  });
});
