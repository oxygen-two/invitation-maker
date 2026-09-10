# Invitation Analytics

This project ships analytics as an optional, no-build browser layer with remote provider SDKs. `index.html` loads `assets/analytics-config.js` and `assets/analytics.js` before `assets/app.js`. If `assets/analytics-config.js` is not loaded before `assets/analytics.js`, analytics stays off.

```html
<script src="assets/analytics-config.js"></script>
<script src="assets/analytics.js"></script>
<script>
  InvitationAnalytics.init();
  InvitationAnalytics.trackLandingViewed();
</script>
```

## Runtime Gate

Analytics only runs on the exact production hostname:

```text
invitation-maker-one.vercel.app
```

Localhost, custom preview hosts, and Vercel preview domains fail open and return `false` from tracking calls. `InvitationAnalyticsConfig.enabled = false`, `InvitationAnalyticsConfig.optOut = true`, browser Do Not Track, or Global Privacy Control also disable dispatch.

## Configuration

`assets/analytics-config.js` contains the public ingestion token for PostHog project `602599` and the Vercel script path. It contains no account credentials or administrative API keys. To disable either provider, clear its configuration:

```js
window.InvitationAnalyticsConfig = {
  enabled: true,
  posthog: {
    apiHost: "",
    token: ""
  },
  vercel: {
    analyticsScriptSrc: ""
  }
};
```

No npm installation or build is required. The production gate loads the PostHog browser SDK from its official US CDN and initializes it with the manual-only settings below. Vercel uses `/_vercel/insights/script.js`, the established endpoint used by `@vercel/analytics` 1.x. The dashboard must have Web Analytics enabled and the site must be redeployed for that route to be available. Do not replace it with the literal `<unique-path>` placeholder from the v2 documentation.

Dashboard configuration (2026-09-10): Vercel Web Analytics enabled on the existing Hobby plan; PostHog autocapture disabled, session recording disabled, and Discard client IP data enabled. No paid upgrade or payment method was added.

Vercel is base analytics only. Hobby-safe builds never dispatch custom Vercel events from this wrapper. The optional Vercel script loader sets up the official `window.va` queue and queues `window.va("beforeSend", sanitizer)` before appending the configured SDK script. The sanitizer reduces any event URL to `origin + "/"` and drops malformed URLs.

## Events

Manual event API:

```js
InvitationAnalytics.trackLandingViewed();
InvitationAnalytics.track("landing_viewed", {}, { dedupKey: "landing" });
InvitationAnalytics.trackTemplateSelected({ templateId: "royal", occasion: "birthday" });
InvitationAnalytics.trackEditingStarted({ templateId: "royal", fieldGroup: "details" });
InvitationAnalytics.trackInvitationCompleted({
  templateId: "royal",
  itemCount: 6,
  photoCount: 2,
  hasMap: true,
  hasHeroImage: true,
  hasIntroEffect: false
});
InvitationAnalytics.trackDraftSaved({ templateId: "royal" }, { dedupKey: "draft:editor:revision-1" });
InvitationAnalytics.trackHtmlDownloaded({ templateId: "royal" }, { dedupKey: "download:editor:royal:revision-1" });
InvitationAnalytics.trackShareClicked({ channel: "copy_link", templateId: "royal" });
```

Supported event names are:

- `landing_viewed`
- `template_selected`
- `editing_started`
- `invitation_completed`
- `draft_saved`
- `html_downloaded`
- `share_clicked`

The current tab defines one `flow_id`; the app does not currently expose a new-invitation action that calls `resetFlow()`. Pass `dedupKey` as the third `track` argument to suppress repeat captures in the same flow. Dedup is namespaced by `flow_id`, works in memory when storage is denied, and is marked only after a configured provider is ready to dispatch. For downloads, use a local-only key derived from non-sensitive state such as `download:<source>:<templateId>:<revision>`. Library actions may use local record IDs in dedup keys, but those IDs are never transmitted as event props. Do not include title, body, raw HTML, or user-entered content in dedup keys.

Allowed event props are intentionally narrow: `template_id`/`templateId`, `occasion`, `layout_family`/`layoutFamily`, `field_group`/`fieldGroup`, `channel`, `item_count`/`itemCount`, `photo_count`/`photoCount`, and `has_*` booleans. `occasion` and `layout_family` are checked against `TemplateCatalog` globals when available. `field_group` and `channel` are fixed enums. `template_id` can be further restricted with `InvitationAnalyticsConfig.allowedTemplateIds`.

## App Integration

Actual editor wiring:

- `landing_viewed`: during app initialization after analytics init.
- `template_selected`: when the selected template is applied.
- `editing_started`: on the first form input, accepted image upload, or item edit mutation only, not on draft restore or initial render.
- `draft_saved`: after `putDraft` succeeds and only if the user has edited.
- `invitation_completed`: only after validation and successful `buildStandaloneHtml` generation.
- `html_downloaded`: after the download anchor click is triggered.
- `share_clicked`: not currently wired because there is no actual share feature.

Map fields should stay coarse. It is acceptable to send booleans such as `hasMap`; do not send map URLs, addresses, place ids, coordinates, or raw place labels.

## Campaign Attribution

The first registered UTM touch is stored in `sessionStorage` and reused for later events. Empty or invalid first touch is frozen as empty for the tab. Restored UTM values are revalidated, so injected or stale values are not trusted. Only these exact values are accepted:

- `utm_source=kakao&utm_medium=social&utm_campaign=launch_2026_09`
- `utm_source=instagram&utm_medium=social&utm_campaign=launch_2026_09`
- `utm_source=naver_blog&utm_medium=referral&utm_campaign=launch_2026_09`
- `utm_source=community&utm_medium=referral&utm_campaign=launch_2026_09`
- `utm_source=qr&utm_medium=offline&utm_campaign=launch_2026_09`

## Privacy Boundary

Analytics properties are allowlisted per known event. Do not send raw names, contact details, addresses, messages, photos, generated HTML, raw URLs, raw referrers, draft IDs, library record IDs, map URLs, addresses, place IDs, coordinates, or raw place labels. PostHog is initialized with autocapture, pageview/pageleave, session recording, exceptions, dead-clicks, rage-clicks, heatmaps, performance capture, feature flags, external dependency loading, recording console logs, and remote config refresh disabled. It also sets `logs: { captureConsoleLogs: false }`. Person profiles are disabled. Its `before_send` drops unknown events, strips automatic URL/referrer/session entry context, keeps only necessary anonymous SDK identifiers, and re-sanitizes event props.
