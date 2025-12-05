const assert = require("node:assert");
const { randomUUID } = require("node:crypto");
const { Site, FEATURES, SERVER_HEADERS, CLIENT_HEADERS } = require("../dist/index.cjs");

(() => {
  const clientId = randomUUID();
  const site = Site({
    clientId,
    features: [FEATURES.CLEAN_WEB],
  });

  assert.equal(site.SERVER_HEADER_NAME, SERVER_HEADERS.WELCOME);
  assert.equal(site.CLIENT_HEADER_NAME, CLIENT_HEADERS.HELLO);
  // cspell:disable-next-line
  assert.equal(site.SERVER_HEADER_VALUE, `${clientId}^1^1`);

  const validHeaderValue =
    "AbXze/EaFy9pEwAAAA==.hQHwRDR4i8wCV8+gYUxgFGd2yXHUMORnhetz+5Aloc84d3vz1dyGi3GDZ5Y4USc2RemCzYaKLltsi+Iu6NJMAQ==";

  assert.deepEqual(site.parseClientToken(validHeaderValue), {
    ADVERTISEMENTS: true,
    COOKIE_CONSENT_SCREEN: true,
    NON_FUNCTIONAL_TRACKING: true,
    MARKETING_DIALOGS: true,
    CONTENT_PAYWALL: true,
    SUBSCRIPTION_ACCESS: false,
  });

  console.info("Passed.");
})();
