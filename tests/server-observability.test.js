const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { createHandler } = require('../server/http.cjs');
const { observeHttp, createReporter } = require('../server/observability.cjs');
const { refreshPublicationExpiry } = require('../server/publishing/use-case.cjs');
const { createHandler: createAdminHandler } = require('../admin/http.cjs');

async function request(t, handler, pathname) {
  const server = http.createServer(handler).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const response = await fetch(`http://127.0.0.1:${server.address().port}${pathname}`);
  return { status: response.status, headers: response.headers, body: await response.json() };
}

test('public storage failure logs one safe event without request or error content', async (t) => {
  const lines = [];
  const secret = 'Alice Smith lives at 123 Private Avenue';
  const handler = createHandler({
    repository: { get: async () => { throw new Error(secret); } },
    config: { logSink: (line) => lines.push(line) }
  });
  const response = await request(t, handler, '/api/invitations/AbCdEfGhIjKlMnOpQrStUv?name=Alice');
  assert.equal(response.status, 503);
  assert.equal(lines.length, 1);
  const event = JSON.parse(lines[0]);
  assert.equal(event.event, 'server_error');
  assert.equal(event.route, 'publication');
  assert.equal(event.status, 503);
  assert.match(event.request_id, /^[a-f0-9-]{36}$/);
  assert.equal(lines[0].includes(secret), false);
  assert.equal(lines[0].includes('AbCdEf'), false);
  assert.equal(lines[0].includes('Alice'), false);
});

test('expected 404 produces no server error event', async (t) => {
  const lines = [];
  const response = await request(t, createHandler({ repository: { get: async () => null }, config: { logSink: (line) => lines.push(line) } }), '/api/invitations/AbCdEfGhIjKlMnOpQrStUv');
  assert.equal(response.status, 404);
  assert.deepEqual(lines, []);
});

test('authenticated admin list failure emits a safe admin event', async (t) => {
  const lines = [];
  const handler = createAdminHandler({
    repository: { list: async () => { throw new Error('Alice Smith'); } },
    sessionStore: { get: () => ({ expiresAt: Date.now() + 1000 }) },
    config: { pageSize: 20, logSink: (line) => lines.push(line) }
  });
  const response = await request(t, handler, '/admin/api/publications?q=Alice');
  assert.equal(response.status, 503);
  assert.deepEqual(response.body, { error: 'REPOSITORY_UNAVAILABLE' });
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).service, 'admin');
  assert.equal(JSON.parse(lines[0]).route, 'publications');
  assert.equal(lines[0].includes('Alice'), false);
});

test('explicit 503 remains unchanged when the log sink throws', async (t) => {
  const handler = createHandler({
    repository: { get: async () => { throw new Error('storage down'); } },
    config: { logSink: () => { throw new Error('sink down'); } }
  });
  const response = await request(t, handler, '/api/invitations/AbCdEfGhIjKlMnOpQrStUv');
  assert.equal(response.status, 503);
  assert.equal(response.body.error.code, 'REPOSITORY_UNAVAILABLE');
});

test('unexpected rejection returns safe 500 and logging failure cannot break response', async (t) => {
  const handler = observeHttp(async () => { throw new Error('private'); }, {
    service: 'admin', report: createReporter(() => { throw new Error('sink down'); })
  });
  const response = await request(t, handler, '/admin/api/publications?password=private');
  assert.equal(response.status, 500);
  assert.deepEqual(response.body, { error: 'INTERNAL_ERROR' });
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});

test('expiry bookkeeping failure stays successful and emits only fixed warning fields', async () => {
  const lines = [];
  const now = new Date('2026-09-13T00:00:00Z');
  const expiresAt = '2026-09-14T00:00:00Z';
  const result = await refreshPublicationExpiry({
    record: { id: 'private-id', createdAt: '2026-09-12T00:00:00Z', expiresAt }, now,
    repository: { refreshExpiry: async () => { throw new Error('private content'); } },
    config: { idleWindowDays: 7, maxLifetimeDays: 30, expiryRefreshThrottleHours: 6, reportServerEvent: createReporter((line) => lines.push(line)) }
  });
  assert.equal(result, expiresAt);
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).event, 'expiry_refresh_failed');
  assert.equal(lines[0].includes('private'), false);
});

test('reporter discards arbitrary properties and rejects unrecognized diagnostic values', () => {
  const lines = [];
  createReporter((line) => lines.push(line))({ event: 'Alice Smith', service: 'private', route: '/i/private', method: 'secret', request_id: 'token', message: '123 Private Avenue', stack: 'private', status: 401 });
  const event = JSON.parse(lines[0]);
  assert.deepEqual(Object.keys(event).sort(), ['event', 'level', 'route', 'service', 'timestamp']);
  assert.equal(event.event, 'server_error');
  assert.equal(event.route, 'other');
});
