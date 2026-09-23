// scripts/smoke-assistant.cjs
// Manual check against the real model. Not part of CI: it spends money.
//   ANTHROPIC_API_KEY=... node scripts/smoke-assistant.cjs "23일 17시 선릉 돈그리아 초대장"
const { readAssistantConfigFromEnv } = require("../server/config/assistant.cjs");
const { readPublishingConfigFromEnv } = require("../server/config/publishing.cjs");
const { createAssistantFromConfig } = require("../server/assistant/bootstrap.cjs");
const { FakePublicationsRepository } = require("../tests/helpers/fake-publications-repository.js");

const request = process.argv.slice(2).join(" ").trim();
const config = { ...readPublishingConfigFromEnv(), ...readAssistantConfigFromEnv() };
if (!config.anthropicApiKey) {
  console.error("ANTHROPIC_API_KEY is required.");
  process.exit(1);
}
if (!request) {
  console.error("Usage: node scripts/smoke-assistant.cjs \"<one-line request>\"");
  process.exit(1);
}

// The in-memory repository only counts quota here; nothing is published.
const assistant = createAssistantFromConfig({ config, repository: new FakePublicationsRepository() });

assistant.draft({ request, clientKeyHash: "smoke", timeZone: process.env.ASSISTANT_SMOKE_TIME_ZONE || "Asia/Seoul" })
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error(`draft failed: ${error.code || error.message}`);
    process.exit(1);
  });
