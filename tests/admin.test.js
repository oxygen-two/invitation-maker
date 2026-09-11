const test = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const fs = require("node:fs");
const path = require("node:path");
const { readAdminConfigFromEnv, passwordMatches } = require("../admin/config.cjs");
const { createHandler, COOKIE } = require("../admin/http.cjs");
const { createAdminMongoPublications } = require("../admin/storage/mongo-publications.cjs");
const { createSessionStore } = require("../admin/session-store.cjs");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const adminClientSource = read("admin/public/admin.js");
const adminCssSource = read("admin/public/admin.css");
const adminServerSource = read("admin/http.cjs");

const call = async (handler, { method = "GET", url = "/", headers = {}, body, socket = {} } = {}) => {
  const req = new Readable({ read() { this.push(null); } });
  req.method = method; req.url = url; req.headers = headers; req.body = body;
  req.socket = { encrypted: false, remoteAddress: "127.0.0.1", ...socket };
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

const make = (repository = new FakeAdminRepository(), configOverrides = {}) => {
  const sessionStore = createSessionStore({ ttlMs: 60_000 });
  return { repository, sessionStore, handler: createHandler({ repository, sessionStore, staticRoot: "/tmp/does-not-exist", config: { adminPassword: "secret", pageSize: 2, publicBaseUrl: "https://example.test", loginRateLimit: { windowMs: 60_000, maxAttempts: 3 }, trustProxy: false, ...configOverrides } }) };
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

test("admin session cookie carries Secure only when the request is actually HTTPS", async () => {
  const plain = make();
  const plainLogin = await call(plain.handler, { method: "POST", url: "/admin/api/login", body: { password: "secret" } });
  assert.equal(plainLogin.status, 200);
  assert.match(plainLogin.headers["set-cookie"], new RegExp(`^${COOKIE}=`));
  assert.doesNotMatch(plainLogin.headers["set-cookie"], /;\s*Secure/, "plain HTTP request must not receive a Secure cookie");
  const plainCookie = plainLogin.headers["set-cookie"].split(";")[0];
  const plainCsrf = plainLogin.body.csrfToken;
  const plainLogout = await call(plain.handler, { method: "POST", url: "/admin/api/logout", headers: { cookie: plainCookie, "x-admin-csrf": plainCsrf } });
  assert.equal(plainLogout.status, 204);
  assert.doesNotMatch(plainLogout.headers["set-cookie"], /;\s*Secure/, "clear-cookie must match the session cookie's Secure attribute");

  const directTls = make();
  const directLogin = await call(directTls.handler, { method: "POST", url: "/admin/api/login", body: { password: "secret" }, socket: { encrypted: true } });
  assert.equal(directLogin.status, 200);
  assert.match(directLogin.headers["set-cookie"], /;\s*Secure/, "req.socket.encrypted === true must produce a Secure cookie");
  const directCookie = directLogin.headers["set-cookie"].split(";")[0];
  const directCsrf = directLogin.body.csrfToken;
  const directLogout = await call(directTls.handler, { method: "POST", url: "/admin/api/logout", headers: { cookie: directCookie, "x-admin-csrf": directCsrf }, socket: { encrypted: true } });
  assert.equal(directLogout.status, 204);
  assert.match(directLogout.headers["set-cookie"], /;\s*Secure/, "clear-cookie must match the session cookie's Secure attribute");

  const untrustedProxy = make();
  const untrustedLogin = await call(untrustedProxy.handler, { method: "POST", url: "/admin/api/login", body: { password: "secret" }, headers: { "x-forwarded-proto": "https" } });
  assert.equal(untrustedLogin.status, 200);
  assert.doesNotMatch(untrustedLogin.headers["set-cookie"], /;\s*Secure/, "x-forwarded-proto must not be trusted when trustProxy is off");

  const trustedProxy = make(new FakeAdminRepository(), { trustProxy: true });
  const trustedLogin = await call(trustedProxy.handler, { method: "POST", url: "/admin/api/login", body: { password: "secret" }, headers: { "x-forwarded-proto": "https" } });
  assert.equal(trustedLogin.status, 200);
  assert.match(trustedLogin.headers["set-cookie"], /;\s*Secure/, "x-forwarded-proto: https must produce a Secure cookie when trustProxy is on");
  const trustedCookie = trustedLogin.headers["set-cookie"].split(";")[0];
  const trustedCsrf = trustedLogin.body.csrfToken;
  const trustedLogout = await call(trustedProxy.handler, { method: "POST", url: "/admin/api/logout", headers: { cookie: trustedCookie, "x-admin-csrf": trustedCsrf, "x-forwarded-proto": "https" } });
  assert.equal(trustedLogout.status, 204);
  assert.match(trustedLogout.headers["set-cookie"], /;\s*Secure/, "clear-cookie must match the session cookie's Secure attribute");
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
  assert.equal(config.trustProxy, false);
});

test("admin config trust-proxy setting defaults off and only turns on with an explicit truthy value", () => {
  assert.equal(readAdminConfigFromEnv({ ADMIN_PASSWORD: "secret" }).trustProxy, false);
  assert.equal(readAdminConfigFromEnv({ ADMIN_PASSWORD: "secret", ADMIN_TRUST_PROXY: "nonsense" }).trustProxy, false);
  assert.equal(readAdminConfigFromEnv({ ADMIN_PASSWORD: "secret", ADMIN_TRUST_PROXY: "true" }).trustProxy, true);
  assert.equal(readAdminConfigFromEnv({ ADMIN_PASSWORD: "secret", ADMIN_TRUST_PROXY: "1" }).trustProxy, true);
  assert.equal(readAdminConfigFromEnv({ ADMIN_PASSWORD: "secret", ADMIN_TRUST_PROXY: "false" }).trustProxy, false);
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

test("admin client sends x-admin-csrf on logout and only shows login on success", () => {
  const start = adminClientSource.indexOf('$("#logout")');
  const end = adminClientSource.indexOf('$("#refresh")');
  assert.ok(start >= 0 && end > start, "logout handler not found");
  const handler = adminClientSource.slice(start, end);
  assert.match(handler, /\/admin\/api\/logout/);
  assert.match(handler, /"x-admin-csrf":\s*state\.csrfToken/);
  assert.match(handler, /catch\s*\(error\)/, "logout failure must be handled, not thrown as an unhandled rejection");
});

test("admin client assigns csrfToken from the session-restore response", () => {
  const start = adminClientSource.indexOf('request("/admin/api/session")');
  assert.ok(start >= 0, "session restore call not found");
  const handler = adminClientSource.slice(start);
  assert.match(handler, /\.then\(\s*\(?body\)?\s*=>\s*\{[^}]*state\.csrfToken\s*=\s*body\.csrfToken/, "session restore must assign the returned csrfToken, not merely receive it");
});

test("admin client sends x-admin-csrf on revoke and reports row-action failures", () => {
  const start = adminClientSource.indexOf('$("#rows").addEventListener');
  const end = adminClientSource.indexOf('request("/admin/api/session")');
  assert.ok(start >= 0 && end > start, "rows click handler not found");
  const handler = adminClientSource.slice(start, end);
  assert.match(handler, /\/revoke/);
  assert.match(handler, /"x-admin-csrf":\s*state\.csrfToken/);
  assert.match(handler, /catch\s*\(error\)/, "detail/revoke failures must not be silently ignored");
});

test("admin client never silently swallows a request failure with an empty catch", () => {
  assert.doesNotMatch(adminClientSource, /\.catch\(\(\)\s*=>\s*\{\s*\}\)/, "an empty .catch(() => {}) drops errors without telling the user");
});

test("admin client maps every server error code to a Korean message instead of showing the raw code", () => {
  const codes = [...new Set([...adminServerSource.matchAll(/error\(res,\s*[^,]+,\s*"([A-Z_]+)"\)/g)].map((match) => match[1]))];
  assert.ok(codes.length > 0, "no error codes found in admin/http.cjs to cross-check against");
  for (const code of codes) {
    const mapping = new RegExp(`${code}:\\s*"[^"]*[가-힣][^"]*"`);
    assert.match(adminClientSource, mapping, `admin.js should map ${code} to a Korean-language message`);
  }
  assert.doesNotMatch(adminClientSource, /throw new Error\(body\?\.error/, "request() must not surface the raw server error code directly");
});

test("admin client's rate-limit message tells the user to wait rather than blaming the password", () => {
  const match = adminClientSource.match(/LOGIN_RATE_LIMITED:\s*"([^"]*)"/);
  assert.ok(match, "LOGIN_RATE_LIMITED mapping not found");
  assert.match(match[1], /(잠시|기다|후\s*다시)/, "message should tell the user to wait");
  assert.doesNotMatch(match[1], /비밀번호/, "message should not suggest the password was wrong");
});

test("admin client marks the revoke action as visually destructive", () => {
  assert.match(adminClientSource, /class="danger"[^>]*data-revoke=/, "revoke button should carry a dedicated destructive class");
  assert.match(adminCssSource, /\.danger/, "admin.css should style the destructive action");
});
