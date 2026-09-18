/* Privacy-safe client diagnostics for browsers where a console is unavailable.
   Reports contain only closed enums, numbers, and frames from shipped scripts.
   Authored invitation text and arbitrary URLs are never transformed into
   telemetry. Keep this file at ES2015 syntax for older in-app WebViews. */
(function (root) {
  const MAX_REPORTS_PER_PAGE = 8;
  const ERROR_KINDS = Object.freeze(["handled", "network", "promise", "resource", "runtime"]);
  const ERROR_MESSAGES = Object.freeze({
    handled: "handled_error",
    network: "network_error",
    promise: "promise_rejection",
    resource: "resource_load_failure",
    runtime: "runtime_error"
  });
  const ERROR_CONTEXTS = Object.freeze([
    "boot",
    "draft_load",
    "draft_save",
    "image_process",
    "map_lookup",
    "preview_render",
    "publish",
    "publish_list",
    "publish_revoke",
    "resource_load",
    "shared_fetch",
    "shared_render",
    "storage",
    "unknown",
    "window"
  ]);

  const PRODUCTION_HOST = "invitation-maker-one.vercel.app";
  const SHIPPED_ASSET_PATHS = Object.freeze([
    "/assets/analytics/analytics.js",
    "/assets/analytics/config.js",
    "/assets/analytics/error-reporting.js",
    "/assets/analytics/ga4.js",
    "/assets/i18n/dictionary-en.js",
    "/assets/i18n/dictionary-ko.js",
    "/assets/i18n/dictionary-site-en.js",
    "/assets/i18n/dictionary-site-ko.js",
    "/assets/i18n/i18n.js",
    "/assets/integrations/map-location.js",
    "/assets/invitation/core.js",
    "/assets/invitation/intro-effects.js",
    "/assets/invitation/template-art.js",
    "/assets/invitation/template-art-index.js",
    "/assets/invitation/template-catalog.js",
    "/assets/invitation/template-renderers.js",
    "/assets/invitation/viewer.js",
    "/assets/media/hero-image.js",
    "/assets/media/image-tools.js",
    "/assets/publishing/publishing.js",
    "/assets/publishing/qr.js",
    "/assets/publishing/shared-invitation.js",
    "/assets/site/consent.js",
    "/assets/site/site.js",
    "/assets/storage/invitation-storage.js",
    "/assets/studio/app.js",
    "/assets/studio/content-order.js",
    "/assets/studio/preset-application.js"
  ]);

  /* Ordered most specific first. In-app WebViews impersonate Safari and Chrome
     in their user agent, so every wrapper has to be matched before the browser
     it claims to be. */
  const BROWSER_ENVIRONMENTS = Object.freeze([
    ["kakaotalk", /KAKAOTALK/i],
    ["line", /\bLine\//i],
    ["instagram", /\bInstagram\b/i],
    ["facebook", /FB(?:AN|AV|_IAB)/i],
    ["naver", /NAVER\(inapp|\bNAVER\b/i],
    ["daum", /\bDaumApps\b/i],
    ["wechat", /MicroMessenger/i],
    ["android_webview", /;\s*wv[;)]/i],
    ["samsung", /SamsungBrowser/i],
    ["edge", /\bEdgA?\//i],
    ["firefox", /\bFxiOS\/|\bFirefox\//i],
    ["chrome", /\bCriOS\/|\bChrome\//i],
    ["safari", /\bSafari\//i]
  ]);

  let installed = false;
  let reporting = false;
  let reportCount = 0;
  let signatures = [];

  const normalizeAssetPath = (value) => {
    if (typeof value !== "string" || !value.trim()) return "";
    const UrlConstructor = root.URL || globalThis.URL;
    if (typeof UrlConstructor !== "function") return "";
    try {
      const parsed = new UrlConstructor(value, `https://${PRODUCTION_HOST}/`);
      if (parsed.hostname !== PRODUCTION_HOST) return "";
      return SHIPPED_ASSET_PATHS.indexOf(parsed.pathname) === -1 ? "" : parsed.pathname;
    } catch (ignored) {
      return "";
    }
  };

  const normalizeStackFrames = (value) => {
    if (typeof value !== "string") return "";
    const frames = [];
    const pattern = /((?:https?:\/\/[^\s():]+)?\/assets\/[A-Za-z0-9_./-]+\.js):(\d+):(\d+)/g;
    let match;
    while ((match = pattern.exec(value)) && frames.length < 8) {
      const asset = normalizeAssetPath(match[1]);
      if (!asset) continue;
      const line = Math.min(Number(match[2]), 9999999);
      const column = Math.min(Number(match[3]), 9999999);
      const frame = `${asset}:${line}:${column}`;
      if (frames.indexOf(frame) === -1) frames.push(frame);
    }
    return frames.join("\n");
  };

  // The root ("/") is the landing page; the editor itself now lives at
  // /studio. Keep this mapping in sync with the clean URLs in vercel.json
  // and server/http/static.cjs.
  const pageKind = (location) => {
    const pathname = String((location && location.pathname) || "");
    if (/^\/i\//.test(pathname)) return "shared";
    if (/viewer\.html$/.test(pathname)) return "viewer";
    if (pathname === "/studio" || /studio\.html$/.test(pathname)) return "studio";
    if (pathname === "" || pathname === "/" || pathname === "/welcome" || /(^|\/)index\.html$/.test(pathname)) return "landing";
    if (pathname === "/guide" || /guide\.html$/.test(pathname)) return "guide";
    if (pathname === "/sample" || /sample\.html$/.test(pathname)) return "sample";
    if (pathname === "/privacy" || /privacy\.html$/.test(pathname)) return "privacy";
    if (pathname === "/terms" || /terms\.html$/.test(pathname)) return "terms";
    return "other";
  };

  const browserEnvironment = (userAgent) => {
    const agent = typeof userAgent === "string" ? userAgent : "";
    if (!agent) return "unknown";
    for (const entry of BROWSER_ENVIRONMENTS) {
      if (entry[1].test(agent)) return entry[0];
    }
    // A bare WKWebView announces no browser token at all.
    if (/iPhone|iPad|iPod/i.test(agent)) return "ios_webview";
    return "other";
  };

  const osFamily = (userAgent) => {
    const agent = typeof userAgent === "string" ? userAgent : "";
    if (/Android/i.test(agent)) return "android";
    if (/iPhone|iPad|iPod/i.test(agent)) return "ios";
    if (/Mac OS X/i.test(agent)) return "macos";
    if (/Windows NT/i.test(agent)) return "windows";
    if (/Linux/i.test(agent)) return "linux";
    return "other";
  };

  /* The single most useful field for "this WebView could not run our code":
     iOS 15 and iOS 18 are different JavaScript engines wearing one name. */
  const osVersion = (userAgent) => {
    const agent = typeof userAgent === "string" ? userAgent : "";
    if (/iPhone|iPad|iPod/i.test(agent)) {
      const ios = agent.match(/OS (\d{1,3})[._](\d{1,3})/);
      if (ios) return `${ios[1]}.${ios[2]}`;
    }
    const android = agent.match(/Android (\d{1,3})(?:\.(\d{1,3}))?/);
    if (android) return `${android[1]}.${android[2] || "0"}`;
    const mac = agent.match(/Mac OS X (\d{1,3})[._](\d{1,3})/);
    if (mac) return `${mac[1]}.${mac[2]}`;
    const windows = agent.match(/Windows NT (\d{1,3})(?:\.(\d{1,3}))?/);
    if (windows) return `${windows[1]}.${windows[2] || "0"}`;
    return "";
  };

  const normalizeEnum = (value, allowed, fallback) => {
    const normalized = typeof value === "string" ? value.trim() : "";
    return allowed.indexOf(normalized) === -1 ? fallback : normalized;
  };

  const positiveInteger = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) return undefined;
    return Math.min(Math.round(number), 9999999);
  };

  const buildPayload = (input, context) => {
    const source = input && typeof input === "object" ? input : {};
    const environment = context && typeof context === "object" ? context : {};
    const location = environment.location || root.location;
    const navigator = environment.navigator || root.navigator;
    const userAgent = navigator && typeof navigator.userAgent === "string" ? navigator.userAgent : "";

    const kind = normalizeEnum(source.kind, ERROR_KINDS, "runtime");
    const payload = {
      browser_env: browserEnvironment(userAgent),
      error_context: normalizeEnum(source.context, ERROR_CONTEXTS, "unknown"),
      error_kind: kind,
      error_message: ERROR_MESSAGES[kind],
      os_family: osFamily(userAgent),
      page: pageKind(location)
    };

    const stack = normalizeStackFrames(source.stack);
    if (stack) payload.error_stack = stack;

    const file = normalizeAssetPath(source.source);
    if (file) payload.error_source = file;

    const line = positiveInteger(source.line);
    if (line !== undefined) payload.error_line = line;

    const column = positiveInteger(source.column);
    if (column !== undefined) payload.error_column = column;

    const status = positiveInteger(source.status);
    if (status !== undefined && status >= 100 && status <= 599) payload.error_status = status;

    const version = osVersion(userAgent);
    if (version) payload.os_version = version;

    return payload;
  };

  const signatureOf = (payload) => [
    payload.error_kind,
    payload.error_context,
    payload.error_message,
    payload.error_source || "",
    payload.error_line === undefined ? "" : payload.error_line,
    payload.error_column === undefined ? "" : payload.error_column
  ].join("|");

  const report = (input) => {
    if (reporting) return false;
    reporting = true;
    try {
      if (reportCount >= MAX_REPORTS_PER_PAGE) return false;

      const analytics = root.InvitationAnalytics;
      if (!analytics || typeof analytics.track !== "function") return false;
      // Diagnostics are the one report that does not wait for the consent
      // banner: this file sends closed enums, a shipped script path and a
      // line number, never authored content or a page URL. The host, opt-out,
      // DNT and GPC gates still apply.
      if (typeof analytics.isEnabled === "function" && !analytics.isEnabled({ essential: true })) return false;

      const payload = buildPayload(input);
      const signature = signatureOf(payload);
      if (signatures.indexOf(signature) !== -1) return false;
      signatures.push(signature);
      reportCount += 1;

      if (typeof analytics.initPostHog === "function") analytics.initPostHog({ essential: true });
      return analytics.track("client_error", payload) === true;
    } catch (ignored) {
      return false;
    } finally {
      reporting = false;
    }
  };

  const reportError = (error, context, options) => {
    const extra = options && typeof options === "object" ? options : {};
    const source = error && typeof error === "object" ? error : {};
    return report({
      column: extra.column,
      context,
      kind: extra.kind || "handled",
      line: extra.line,
      source: extra.source,
      stack: typeof source.stack === "string" ? source.stack : "",
      status: extra.status === undefined ? source.status : extra.status
    });
  };

  const reportFailure = (context, options) => {
    const extra = options && typeof options === "object" ? options : {};
    return report({
      context,
      kind: "network",
      status: extra.status
    });
  };

  const onErrorEvent = (event) => {
    try {
      if (!event) return;
      const target = event.target;
      if (target && target !== root && typeof target.tagName === "string") {
        report({
          context: "resource_load",
          kind: "resource",
          source: typeof target.src === "string" ? target.src : target.href
        });
        return;
      }
      const error = event.error;
      report({
        column: event.colno,
        context: "window",
        kind: "runtime",
        line: event.lineno,
        source: event.filename,
        stack: error && typeof error.stack === "string" ? error.stack : ""
      });
    } catch (ignored) {
      // A reporter that throws is worse than a reporter that misses.
    }
  };

  const onRejectionEvent = (event) => {
    try {
      if (!event) return;
      const reason = event.reason;
      report({
        context: "window",
        kind: "promise",
        stack: reason && typeof reason.stack === "string" ? reason.stack : ""
      });
    } catch (ignored) {
      // As above.
    }
  };

  /* window.onerror is wired alongside addEventListener rather than instead of
     it: the two disagree in some old WebViews, and those are the browsers this
     whole file is for. A browser that fires both produces one report, because
     the signature check runs before the budget is spent. Any handler that was
     already there is still called. */
  const installLegacyHandler = (scope) => {
    const previous = typeof scope.onerror === "function" ? scope.onerror : null;
    scope.onerror = function (message, source, line, column, error) {
      try {
        report({
          column,
          context: "window",
          kind: "runtime",
          line,
          source,
          stack: error && typeof error.stack === "string" ? error.stack : ""
        });
      } catch (ignored) {
        // Never let reporting suppress the browser's own handling.
      }
      if (previous) return previous.apply(this, arguments);
      return false;
    };
  };

  const install = (target) => {
    const scope = target || root;
    if (installed) return false;
    if (!scope || typeof scope.addEventListener !== "function") return false;
    installed = true;
    scope.addEventListener("error", onErrorEvent, true);
    scope.addEventListener("unhandledrejection", onRejectionEvent);
    installLegacyHandler(scope);
    return true;
  };

  const init = (options) => {
    const settings = options && typeof options === "object" ? options : {};
    const attached = install(settings.target);
    try {
      const analytics = root.InvitationAnalytics;
      // Idempotent, and a no-op off production: this only puts the existing
      // PostHog queue in place early enough that a fault during page boot has
      // somewhere to go.
      if (analytics && typeof analytics.initPostHog === "function") analytics.initPostHog();
    } catch (ignored) {
      // Analytics must not interrupt the page, error reporting least of all.
    }
    return attached;
  };

  // Test seam only: production never needs to forget what it has reported.
  const reset = () => {
    installed = false;
    reporting = false;
    reportCount = 0;
    signatures = [];
  };

  const api = Object.freeze({
    ERROR_CONTEXTS,
    ERROR_KINDS,
    MAX_REPORTS_PER_PAGE,
    browserEnvironment,
    buildPayload,
    init,
    install,
    normalizeAssetPath,
    normalizeStackFrames,
    osFamily,
    osVersion,
    pageKind,
    report,
    reportError,
    reportFailure,
    reset
  });

  root.InvitationErrorReporting = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (root.addEventListener && root.document) init();
})(typeof window !== "undefined" ? window : globalThis);
