(function (root) {
  const productionHost = "invitation-maker-one.vercel.app";
  const firstTouchKey = "invitation_analytics:first_touch";
  const flowIdKey = "invitation_analytics:flow_id";
  const dedupPrefix = "invitation_analytics:dedup:";
  const registeredCampaign = "launch_2026_09";
  const registeredUtmPairs = Object.freeze({
    kakao: "social",
    instagram: "social",
    naver_blog: "referral",
    community: "referral",
    qr: "offline"
  });
  const defaultOccasionIds = Object.freeze([
    "date",
    "birthday",
    "anniversary",
    "event",
    "kindergarten",
    "wedding",
    "gohui",
    "hwangap",
    "first-birthday"
  ]);
  const defaultFamilyIds = Object.freeze([
    "romantic-story",
    "celebration-poster",
    "kids-storybook",
    "wedding-editorial",
    "korean-heritage"
  ]);
  const fieldGroups = Object.freeze([
    "content",
    "details",
    "editor",
    "gallery",
    "hero-image",
    "location",
    "style"
  ]);
  const shareChannels = Object.freeze([
    "copy_link",
    "download",
    "native_share",
    "open_viewer"
  ]);
  const automaticContextProperties = new Set([
    "$current_url",
    "$host",
    "$initial_current_url",
    "$initial_pathname",
    "$initial_referrer",
    "$initial_referring_domain",
    "$pathname",
    "$referrer",
    "$referring_domain",
    "$session_entry_current_url",
    "$session_entry_host",
    "$session_entry_pathname",
    "$session_entry_referrer",
    "$session_entry_referring_domain",
    "$session_initial_referrer",
    "$session_initial_referring_domain",
    "$session_initial_url",
    "$set",
    "$set_once",
    "$url"
  ]);
  const anonymousSdkProperties = new Set([
    "$anon_distinct_id",
    "$device_id",
    "$session_id",
    "distinct_id"
  ]);
  const eventPropertyAllowlist = Object.freeze({
    landing_viewed: ["campaign", "flow_id", "medium", "source"],
    template_selected: ["campaign", "flow_id", "layout_family", "medium", "occasion", "source", "template_id"],
    editing_started: ["campaign", "field_group", "flow_id", "medium", "occasion", "source", "template_id"],
    invitation_completed: [
      "campaign",
      "flow_id",
      "has_hero_image",
      "has_intro_effect",
      "has_map",
      "item_count",
      "medium",
      "occasion",
      "photo_count",
      "source",
      "template_id"
    ],
    draft_saved: ["campaign", "flow_id", "medium", "source", "template_id"],
    html_downloaded: ["campaign", "flow_id", "medium", "source", "template_id"],
    share_clicked: ["campaign", "channel", "flow_id", "medium", "source", "template_id"]
  });
  const stringLimits = Object.freeze({
    campaign: 64,
    channel: 32,
    field_group: 40,
    flow_id: 80,
    layout_family: 64,
    medium: 32,
    occasion: 64,
    source: 32,
    template_id: 80
  });
  const sessionDedupKeys = new Set();
  let memoryFlowId = "";
  let postHogReady = false;
  let postHogLoaderLoaded = false;
  let vercelLoaded = false;

  const getConfig = () => root.InvitationAnalyticsConfig || null;

  const storage = () => {
    try {
      return root.sessionStorage || null;
    } catch {
      return null;
    }
  };

  const storageGet = (key) => {
    try {
      return storage()?.getItem(key) || "";
    } catch {
      return "";
    }
  };

  const storageSet = (key, value) => {
    try {
      storage()?.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  };

  const isProduction = () => root.location?.hostname === productionHost;

  const isOptedOut = () => {
    const config = getConfig();
    const doNotTrack = root.navigator?.doNotTrack === "1" || root.navigator?.globalPrivacyControl === true;
    return !config || config.enabled === false || config.optOut === true || doNotTrack;
  };

  const isEnabled = () => isProduction() && !isOptedOut();

  const makeFlowId = () => {
    if (memoryFlowId) return memoryFlowId;
    const existing = storageGet(flowIdKey);
    if (existing) {
      memoryFlowId = existing;
      return existing;
    }

    const generated = root.crypto && typeof root.crypto.randomUUID === "function"
      ? root.crypto.randomUUID()
      : `flow-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    memoryFlowId = generated;
    storageSet(flowIdKey, generated);
    return generated;
  };

  const normalizeString = (value, maxLength) => {
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return "";
    return String(value).trim().slice(0, maxLength);
  };

  const configuredValues = (key) => {
    const values = getConfig()?.[key];
    return Array.isArray(values) ? values.map((value) => String(value)) : [];
  };

  const catalogValues = (key, fallback) => {
    const values = root.TemplateCatalog?.[key];
    return Array.isArray(values) ? values.map((value) => String(value)) : fallback;
  };

  const includesValue = (values, value) => values.includes(value);

  const normalizeAllowedValue = (key, value) => {
    const normalized = normalizeString(value, stringLimits[key] || 64);
    if (!normalized) return "";

    if (key === "campaign") return normalized === registeredCampaign ? normalized : "";
    if (key === "medium") return Object.values(registeredUtmPairs).includes(normalized) ? normalized : "";
    if (key === "source") return Object.hasOwn(registeredUtmPairs, normalized) ? normalized : "";
    if (key === "occasion") return includesValue(catalogValues("OCCASION_IDS", defaultOccasionIds), normalized) ? normalized : "";
    if (key === "layout_family") return includesValue(catalogValues("FAMILY_IDS", defaultFamilyIds), normalized) ? normalized : "";
    if (key === "field_group") return includesValue(fieldGroups, normalized) ? normalized : "";
    if (key === "channel") return includesValue(shareChannels, normalized) ? normalized : "";
    if (key === "template_id") {
      const allowedTemplateIds = configuredValues("allowedTemplateIds");
      if (allowedTemplateIds.length) return includesValue(allowedTemplateIds, normalized) ? normalized : "";
      return /^[a-z0-9][a-z0-9-]{0,79}$/.test(normalized) ? normalized : "";
    }
    return normalized;
  };

  const registeredFirstTouchFrom = (search) => {
    let params;
    try {
      const SearchParams = root.URLSearchParams || globalThis.URLSearchParams;
      if (typeof SearchParams !== "function") return null;
      params = new SearchParams(search || root.location?.search || "");
    } catch {
      return null;
    }

    const source = params.get("utm_source") || "";
    const medium = params.get("utm_medium") || "";
    const campaign = params.get("utm_campaign") || "";
    if (campaign !== registeredCampaign || registeredUtmPairs[source] !== medium) return null;

    return {
      utm_campaign: campaign,
      utm_medium: medium,
      utm_source: source
    };
  };

  const validateFirstTouch = (value) => {
    if (!value || typeof value !== "object") return {};
    const source = value.utm_source || "";
    const medium = value.utm_medium || "";
    const campaign = value.utm_campaign || "";
    if (campaign !== registeredCampaign || registeredUtmPairs[source] !== medium) return {};
    return {
      utm_campaign: campaign,
      utm_medium: medium,
      utm_source: source
    };
  };

  const registerFirstTouch = (search) => {
    const existing = storageGet(firstTouchKey);
    if (existing) {
      try {
        return validateFirstTouch(JSON.parse(existing));
      } catch {
        return {};
      }
    }

    const firstTouch = registeredFirstTouchFrom(search) || {};
    storageSet(firstTouchKey, JSON.stringify(firstTouch));
    return firstTouch;
  };

  const firstTouchProps = () => {
    const firstTouch = registerFirstTouch();
    return {
      campaign: firstTouch.utm_campaign || undefined,
      medium: firstTouch.utm_medium || undefined,
      source: firstTouch.utm_source || undefined
    };
  };

  const normalizeBoolean = (value) => value === true || value === "true" || value === 1;

  const normalizeNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.round(number)) : undefined;
  };

  const propValue = (source, key) => {
    if (Object.hasOwn(source, key)) return source[key];
    const camelKey = key.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());
    if (Object.hasOwn(source, camelKey)) return source[camelKey];
    return undefined;
  };

  const sanitizeProps = (eventName, input = {}) => {
    const allowed = eventPropertyAllowlist[eventName];
    if (!allowed) return null;

    const merged = {
      ...input,
      ...firstTouchProps(),
      flow_id: makeFlowId()
    };
    const props = {};
    for (const key of allowed) {
      const value = propValue(merged, key);
      if (value === undefined || value === null || value === "") continue;
      if (key.startsWith("has_")) {
        props[key] = normalizeBoolean(value);
      } else if (key.endsWith("_count")) {
        const number = normalizeNumber(value);
        if (number !== undefined) props[key] = number;
      } else {
        const normalized = normalizeAllowedValue(key, value);
        if (normalized) props[key] = normalized;
      }
    }
    return props;
  };

  const sanitizeExistingProps = (eventName, input = {}) => {
    const allowed = eventPropertyAllowlist[eventName];
    if (!allowed) return null;

    const props = {};
    for (const key of allowed) {
      const value = propValue(input, key);
      if (value === undefined || value === null || value === "") continue;
      if (key.startsWith("has_")) {
        props[key] = normalizeBoolean(value);
      } else if (key.endsWith("_count")) {
        const number = normalizeNumber(value);
        if (number !== undefined) props[key] = number;
      } else {
        const normalized = normalizeAllowedValue(key, value);
        if (normalized) props[key] = normalized;
      }
    }
    return props;
  };

  const dedupKeyFor = (dedupKey) => `${dedupPrefix}${makeFlowId()}:${normalizeString(dedupKey, 160)}`;

  const isDeduped = (dedupKey) => {
    if (!dedupKey) return false;
    const key = dedupKeyFor(dedupKey);
    return sessionDedupKeys.has(key) || Boolean(storageGet(key));
  };

  const markDeduped = (dedupKey) => {
    if (!dedupKey) return;
    const key = dedupKeyFor(dedupKey);
    sessionDedupKeys.add(key);
    storageSet(key, "1");
  };

  const capturePostHog = (eventName, props) => {
    if (postHogReady && root.posthog && typeof root.posthog.capture === "function") {
      root.posthog.capture(eventName, props);
      return true;
    }
    return false;
  };

  const installPostHogStub = () => {
    if (root.posthog && typeof root.posthog.init === "function") {
      return true;
    }

    const posthog = Array.isArray(root.posthog) ? root.posthog : [];
    const enqueue = (method) => {
      posthog[method] = function (...args) {
        posthog.push([method, ...args]);
      };
    };

    posthog._i = posthog._i || [];
    posthog.__SV = 1;
    posthog.init = function (token, options, name) {
      const target = name ? (posthog[name] = posthog[name] || []) : posthog;
      target._i = target._i || [];
      target._i.push([token, options, name]);
      return target;
    };
    enqueue("capture");
    root.posthog = posthog;
    return true;
  };

  const loadPostHogAnalytics = (documentRef = root.document) => {
    try {
      if (postHogLoaderLoaded) return true;
      if (!documentRef?.createElement || !documentRef.head?.append) return false;

      const script = documentRef.createElement("script");
      script.async = true;
      script.src = "https://us-assets.i.posthog.com/static/array.js";
      script.type = "text/javascript";
      script.setAttribute("data-invitation-analytics", "posthog");
      documentRef.head.append(script);
      postHogLoaderLoaded = true;
      return true;
    } catch {
      return false;
    }
  };

  const track = (eventName, props = {}, options = {}) => {
    try {
      if (!isEnabled()) return false;
      if (!eventPropertyAllowlist[eventName]) return false;
      const dedupKey = options.dedupKey || props.dedupKey;
      if (isDeduped(dedupKey)) return false;

      const sanitized = sanitizeProps(eventName, props);
      if (!sanitized) return false;

      const sentPostHog = capturePostHog(eventName, sanitized);
      if (sentPostHog) markDeduped(dedupKey);
      return sentPostHog;
    } catch {
      return false;
    }
  };

  const postHogBeforeSend = (event) => {
    if (!event || typeof event !== "object") return event;
    if (!eventPropertyAllowlist[event.event]) return null;
    const properties = { ...(event.properties || {}) };
    for (const key of automaticContextProperties) delete properties[key];

    const sdkProperties = {};
    for (const key of anonymousSdkProperties) {
      if (properties[key] !== undefined && properties[key] !== null && properties[key] !== "") {
        sdkProperties[key] = normalizeString(properties[key], 120);
      }
    }
    if (properties.token === getConfig()?.posthog?.token) {
      sdkProperties.token = properties.token;
    }

    return {
      ...event,
      properties: {
        ...sdkProperties,
        ...sanitizeExistingProps(event.event, properties)
      }
    };
  };

  const initPostHog = () => {
    try {
      if (postHogReady) return true;
      if (!isEnabled()) return false;
      const posthog = getConfig().posthog || {};
      if (!posthog.token) return false;
      if (!installPostHogStub()) return false;
      if (Array.isArray(root.posthog) && !loadPostHogAnalytics()) return false;
      root.posthog.init(posthog.token, {
        api_host: posthog.apiHost || undefined,
        advanced_disable_feature_flags: true,
        autocapture: false,
        capture_dead_clicks: false,
        capture_exceptions: false,
        capture_heatmaps: false,
        capture_pageleave: false,
        capture_pageview: false,
        capture_performance: false,
        disable_external_dependency_loading: true,
        disable_scroll_properties: true,
        disable_session_recording: true,
        enable_recording_console_log: false,
        logs: { captureConsoleLogs: false },
        before_send: postHogBeforeSend,
        person_profiles: "never",
        persistence: "sessionStorage",
        rageclick: false,
        remote_config_refresh_interval_ms: 0
      });
      postHogReady = true;
      return true;
    } catch {
      postHogReady = false;
      return false;
    }
  };

  const sanitizeVercelEvent = (event) => {
    if (!event || typeof event !== "object" || !event.url) return event || null;
    try {
      const Url = root.URL || globalThis.URL;
      if (typeof Url !== "function") return null;
      const parsed = new Url(event.url);
      return {
        ...event,
        url: `${parsed.origin}/`
      };
    } catch {
      return null;
    }
  };

  const loadVercelAnalytics = (documentRef = root.document) => {
    try {
      if (vercelLoaded) return true;
      if (!isEnabled() || !documentRef?.createElement || !documentRef.head?.append) return false;
      const scriptSrc = normalizeString(getConfig().vercel?.analyticsScriptSrc || "", 400);
      if (!scriptSrc) return false;

      if (typeof root.va !== "function") {
        root.va = function (...args) {
          root.vaq = root.vaq || [];
          root.vaq.push(args);
        };
      }
      root.va("beforeSend", sanitizeVercelEvent);

      const script = documentRef.createElement("script");
      script.defer = true;
      script.src = scriptSrc;
      script.setAttribute("data-invitation-analytics", "vercel");
      documentRef.head.append(script);
      vercelLoaded = true;
      return true;
    } catch {
      return false;
    }
  };

  const resetFlow = () => {
    try {
      storage()?.removeItem(flowIdKey);
      for (const key of sessionDedupKeys) storage()?.removeItem(key);
      sessionDedupKeys.clear();
      memoryFlowId = "";
      makeFlowId();
      return true;
    } catch {
      return false;
    }
  };

  const api = Object.freeze({
    init() {
      loadVercelAnalytics();
      initPostHog();
      return isEnabled();
    },
    initPostHog,
    isEnabled,
    loadVercelAnalytics,
    registerFirstTouch,
    resetFlow,
    track,
    trackDraftSaved: (props = {}, options = {}) => track("draft_saved", props, options),
    trackEditingStarted: (props = {}, options = {}) => track("editing_started", props, options),
    trackHtmlDownloaded: (props = {}, options = {}) => track("html_downloaded", props, options),
    trackInvitationCompleted: (props = {}, options = {}) => track("invitation_completed", props, options),
    trackLandingViewed: (props = {}, options = {}) => track("landing_viewed", props, options),
    trackShareClicked: (props = {}, options = {}) => track("share_clicked", props, options),
    trackTemplateSelected: (props = {}, options = {}) => track("template_selected", props, options)
  });

  root.InvitationAnalytics = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
