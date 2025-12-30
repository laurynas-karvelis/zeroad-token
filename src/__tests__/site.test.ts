import { randomUUID } from "crypto";
import { describe, test, expect, beforeEach, spyOn } from "bun:test";
import { CLIENT_HEADER, CURRENT_PROTOCOL_VERSION, FEATURE, SERVER_HEADER } from "../constants";
import { encodeClientHeader } from "../headers/client";
import * as clientHeader from "../headers/client";
import { generateKeys } from "../crypto";
import { Site } from "../site";

describe("Site()", () => {
  let privateKey: string;
  let clientId: string;

  beforeEach(() => {
    const keys = generateKeys();

    privateKey = keys.privateKey;
    clientId = randomUUID();
  });

  test("should generate a valid server header", () => {
    const site = Site({ clientId, features: [FEATURE.CLEAN_WEB, FEATURE.ONE_PASS] });
    expect(site.SERVER_HEADER_NAME).toEqual(SERVER_HEADER.WELCOME);
    expect(site.SERVER_HEADER_VALUE).toBe(`${clientId}^1^3`);
  });

  test("should contain correct client hello header name", () => {
    const site = Site({ clientId, features: [FEATURE.CLEAN_WEB] });
    expect(site.CLIENT_HEADER_NAME).toEqual(CLIENT_HEADER.HELLO.toLowerCase());
  });

  test("should call parseClientToken() correctly", async () => {
    const features = [FEATURE.CLEAN_WEB, FEATURE.ONE_PASS];
    const site = Site({ clientId, features });

    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
    const clientHeaderValue = await encodeClientHeader(
      { version: CURRENT_PROTOCOL_VERSION, expiresAt, features: [FEATURE.CLEAN_WEB] },
      privateKey
    );

    spyOn(clientHeader, "parseClientToken");
    const tokenContext = await site.parseClientToken(clientHeaderValue);

    expect(clientHeader.parseClientToken).toHaveBeenCalledTimes(1);
    expect(clientHeader.parseClientToken).toHaveBeenCalledWith(clientHeaderValue, { clientId, features });

    expect(tokenContext).toEqual({
      DISABLE_CONTENT_PAYWALL: false,
      DISABLE_NON_FUNCTIONAL_TRACKING: false,
      ENABLE_SUBSCRIPTION_ACCESS: false,
      HIDE_ADVERTISEMENTS: false,
      HIDE_COOKIE_CONSENT_SCREEN: false,
      HIDE_MARKETING_DIALOGS: false,
    });
  });
});
