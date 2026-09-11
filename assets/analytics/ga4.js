(function (root) {
  const productionHost = "invitation-maker-one.vercel.app";
  const stateKey = "__InvitationAnalyticsGA4State";
  const scriptSelector = 'script[data-invitation-analytics="ga4"]';
  const validMeasurementId = /^G-[A-Z0-9]{6,20}$/;

  const getConfig = () => root.InvitationAnalyticsConfig || null;

  const measurementId = () => {
    const id = getConfig()?.ga4?.measurementId;
    return typeof id === "string" ? id.trim() : "";
  };

  const isProduction = () => root.location?.hostname === productionHost;

  const isEnabled = () => {
    const config = getConfig();
    const id = measurementId();
    const optedOut = config?.optOut === true ||
      root.navigator?.doNotTrack === "1" ||
      root.navigator?.globalPrivacyControl === true;
    return Boolean(config && config.enabled !== false && !optedOut && isProduction() && validMeasurementId.test(id));
  };

  const pageKind = () => {
    const pathname = root.location?.pathname || "/";
    return pathname === "/i/shared" || pathname.startsWith("/i/") ? "shared" : "maker";
  };

  const sanitizedPageContext = () => {
    const origin = root.location?.origin || `https://${productionHost}`;
    if (pageKind() === "shared") {
      return {
        page_location: `${origin}/i/shared`,
        page_title: "Shared Invitation",
        page_referrer: ""
      };
    }

    return {
      page_location: `${origin}/`,
      page_title: "Invitation Studio",
      page_referrer: ""
    };
  };

  const state = () => {
    root[stateKey] = root[stateKey] || {
      sentPageView: false
    };
    return root[stateKey];
  };

  const installScript = (id, documentRef = root.document) => {
    try {
      if (!documentRef?.createElement || !documentRef.head?.append) return false;
      if (typeof documentRef.querySelector === "function" && documentRef.querySelector(scriptSelector)) return true;

      const script = documentRef.createElement("script");
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
      script.referrerPolicy = "no-referrer";
      script.onerror = function () {};
      script.setAttribute("data-invitation-analytics", "ga4");
      documentRef.head.append(script);
      return true;
    } catch {
      return false;
    }
  };

  const installQueue = () => {
    if (!Array.isArray(root.dataLayer)) root.dataLayer = [];
    if (typeof root.gtag !== "function") {
      root.gtag = function () {
        root.dataLayer.push(Array.prototype.slice.call(arguments));
      };
    }
    return root.gtag;
  };

  const init = (documentRef = root.document) => {
    try {
      if (!isEnabled()) return false;
      const id = measurementId();
      if (!installScript(id, documentRef)) return false;

      const currentState = state();
      if (currentState.sentPageView) return true;

      const gtag = installQueue();
      gtag("js", new Date());
      gtag("set", sanitizedPageContext());
      gtag("config", id, {
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false
      });
      gtag("event", "page_view", {
        send_to: id
      });
      currentState.sentPageView = true;
      return true;
    } catch {
      return false;
    }
  };

  root.InvitationAnalyticsGA4 = {
    init,
    isEnabled
  };

  init();
})(typeof window !== "undefined" ? window : globalThis);
