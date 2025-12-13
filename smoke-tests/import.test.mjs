import assert from "node:assert";
import { randomUUID } from "node:crypto";
import { Site, FEATURES, SERVER_HEADERS, CLIENT_HEADERS } from "../dist/index.mjs";

(() => {
  const clientId = randomUUID();
  const site = Site({
    clientId,
    features: [FEATURES.CLEAN_WEB],
  });

  assert.equal(site.SERVER_HEADER_NAME, SERVER_HEADERS.WELCOME);
  assert.equal(site.CLIENT_HEADER_NAME, CLIENT_HEADERS.HELLO.toLowerCase());
  assert.equal(site.SERVER_HEADER_VALUE, `${clientId}^1^1`);

  const validHeaderValue =
    "AbXze/EaFy9pEwAAAA==.hQHwRDR4i8wCV8+gYUxgFGd2yXHUMORnhetz+5Aloc84d3vz1dyGi3GDZ5Y4USc2RemCzYaKLltsi+Iu6NJMAQ==";

  const tokenContext = site.parseClientToken(validHeaderValue);
  assert.deepEqual(tokenContext, {
    HIDE_ADVERTISEMENTS: false,
    HIDE_COOKIE_CONSENT_SCREEN: false,
    HIDE_MARKETING_DIALOGS: false,
    DISABLE_NON_FUNCTIONAL_TRACKING: false,
    DISABLE_CONTENT_PAYWALL: false,
    ENABLE_SUBSCRIPTION_ACCESS: false,
  });

  // eslint-disable-next-line no-console
  console.info("Passed.");
})();
