(function (root) {
  root.InvitationAnalyticsConfig = root.InvitationAnalyticsConfig || {
    enabled: true,
    posthog: {
      apiHost: "https://us.i.posthog.com",
      // Public ingestion token, not an account or administrative API credential.
      token: "phc_sGYr45steRy4nEUdioFcaPkueKdebqBBbxbUPrk5rMZ8"
    },
    ga4: {
      measurementId: ""
    },
    vercel: {
      analyticsScriptSrc: "/_vercel/insights/script.js"
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
