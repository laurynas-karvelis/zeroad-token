import { randomUUID } from "crypto";
import { describe, test, expect, beforeEach, spyOn } from "bun:test";
import { generateKeys } from "../crypto";
import {
  CLIENT_HEADERS,
  CURRENT_PROTOCOL_VERSION,
  FEATURES,
  SERVER_HEADERS,
  ZEROAD_NETWORK_PUBLIC_KEY,
} from "../constants";
import { encodeClientHeader } from "../headers/client";
import * as clientHeader from "../headers/client";
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
    const site = Site({ clientId, features: [FEATURES.CLEAN_WEB, FEATURES.ONE_PASS] });
    expect(site.SERVER_HEADER_NAME).toEqual(SERVER_HEADERS.WELCOME);
    // cspell:disable-next-line
    expect(site.SERVER_HEADER_VALUE).toBe(`${clientId}^1^3`);
  });

  test("should contain correct client hello header name", () => {
    const site = Site({ clientId, features: [FEATURES.CLEAN_WEB] });
    expect(site.CLIENT_HEADER_NAME).toEqual(CLIENT_HEADERS.HELLO);
  });

  test("should call parseClientToken() correctly", () => {
    const site = Site({ clientId, features: [FEATURES.CLEAN_WEB, FEATURES.ONE_PASS] });

    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
    const clientHeaderValue = encodeClientHeader(
      { version: CURRENT_PROTOCOL_VERSION, expiresAt, features: [FEATURES.CLEAN_WEB] },
      privateKey
    );

    spyOn(clientHeader, "parseClientToken");
    const tokenContext = site.parseClientToken(clientHeaderValue);

    expect(clientHeader.parseClientToken).toHaveBeenCalledTimes(1);
    expect(clientHeader.parseClientToken).toHaveBeenCalledWith(clientHeaderValue, clientId, ZEROAD_NETWORK_PUBLIC_KEY);

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
