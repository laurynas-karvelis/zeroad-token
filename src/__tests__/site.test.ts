import { randomUUID } from "crypto";
import { describe, test, expect, beforeEach } from "bun:test";
import { generateKeys, importPrivateKey, KeyObject } from "../crypto";
import { CLIENT_HEADERS, CURRENT_PROTOCOL_VERSION, FEATURES, SERVER_HEADERS } from "../constants";
import { encodeClientHeader } from "../headers/client";
import { Site } from "../site";

describe("Site()", () => {
  let privateKey: KeyObject;
  let publicKey: string;
  let clientId: string;

  beforeEach(() => {
    const { publicKey: publicKeyB64, privateKey: privateKeyB64 } = generateKeys();

    privateKey = importPrivateKey(privateKeyB64);
    publicKey = publicKeyB64;

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

  test("should parse client header data correctly with the official public key", () => {
    const site = Site({ clientId, features: [FEATURES.CLEAN_WEB, FEATURES.ONE_PASS], _publicKey: publicKey });

    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
    const clientHeaderValue = encodeClientHeader(
      { version: CURRENT_PROTOCOL_VERSION, expiresAt, features: [FEATURES.CLEAN_WEB] },
      privateKey
    );

    const tokenContext = site.parseClientToken(clientHeaderValue);
    expect(tokenContext).toEqual({
      ADVERTISEMENTS: false,
      COOKIE_CONSENT_SCREEN: false,
      NON_FUNCTIONAL_TRACKING: false,
      MARKETING_DIALOGS: false,
      CONTENT_PAYWALL: true,
      SUBSCRIPTION_ACCESS: false,
    });
  });
});
