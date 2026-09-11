const test = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const { createHandler, COOKIE } = require("../admin/http.cjs");
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
  return { repository, sessionStore, handler: createHandler({ repository, sessionStore, staticRoot: "/tmp/does-not-exist", config: { adminPassword: "secret", pageSize: 2, publicBaseUrl: "https://example.test" } }) };
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
  const logout = await call(setup.handler, { method: "POST", url: "/admin/api/logout", headers: { cookie } });
  assert.equal(logout.status, 204);
  assert.match(logout.headers["set-cookie"], new RegExp(`^${COOKIE}=`));
});

test("admin routes require a session", async () => {
  const { handler } = make();
  const response = await call(handler, { url: "/admin/api/publications" });
  assert.equal(response.status, 401);
});
