const { randomUUID } = require('node:crypto');

// Diagnostic records contain only closed vocabularies and generated IDs.
// Do not add Error.message/stack, request URLs, headers or database objects.
const createReporter = (sink = (line) => console.error(line)) => (input = {}) => {
  try {
    const event = input.event === 'expiry_refresh_failed' ? 'expiry_refresh_failed' : 'server_error';
    const record = {
      timestamp: new Date().toISOString(),
      event,
      level: event === 'server_error' ? 'error' : 'warn',
      service: input.service === 'admin' ? 'admin' : 'public',
      route: ['publication', 'publications', 'session', 'static'].includes(input.route) ? input.route : 'other'
    };
    if (Number.isInteger(input.status) && input.status >= 500 && input.status <= 599) record.status = input.status;
    if (['GET', 'HEAD', 'POST', 'DELETE', 'OPTIONS'].includes(input.method)) record.method = input.method;
    if (/^[a-f0-9-]{36}$/.test(input.request_id || '')) record.request_id = input.request_id;
    sink(JSON.stringify(record));
  } catch { /* Diagnostics must never change the API outcome. */ }
};

const routeKind = (req, service) => {
  const url = new URL(req.url || '/', 'http://local');
  if (service === 'admin') {
    if (url.pathname === '/admin/api/publications') return 'publications';
    if (/^\/admin\/api\/publications\/[^/]+(?:\/revoke)?$/.test(url.pathname)) return 'publication';
    if (/^\/admin\/api\/(login|logout|session)$/.test(url.pathname)) return 'session';
  } else {
    if (/^\/api\/invitations(?:\.js)?$/.test(url.pathname)) return req.query?.id || url.searchParams.has('id') ? 'publication' : 'publications';
    if (/^\/api\/invitations\/[^/]+$/.test(url.pathname)) return 'publication';
  }
  return url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin/api/') ? 'other' : 'static';
};

const observeHttp = (handler, { service = 'public', report = createReporter() } = {}) => async (req, res) => {
  const requestId = randomUUID();
  let route = 'other';
  let logged = false;
  const log = (status) => {
    if (logged || status < 500) return;
    logged = true;
    try { report({ event: 'server_error', service, route, status, method: req.method, request_id: requestId }); } catch {}
  };
  const writeHead = res.writeHead;
  res.writeHead = function (status, ...args) {
    log(status);
    return writeHead.call(this, status, ...args);
  };
  try {
    route = routeKind(req, service);
    return await handler(req, res);
  } catch {
    log(500);
    if (res.headersSent) {
      if (typeof res.destroy === 'function') res.destroy();
      return;
    }
    res.writeHead(500, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff'
    });
    res.end(JSON.stringify(service === 'admin' ? { error: 'INTERNAL_ERROR' } : { error: { code: 'INTERNAL_ERROR', message: 'Internal server error.' } }));
  }
};

module.exports = { createReporter, observeHttp };
