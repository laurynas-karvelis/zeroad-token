import { randomUUID } from "crypto";
import { describe, test, expect, beforeEach } from "bun:test";
import { CURRENT_PROTOCOL_VERSION, FEATURES, ZEROAD_NETWORK_PUBLIC_KEY } from "../constants";
import { generateKeys, importPrivateKey, importPublicKey, KeyObject } from "../crypto";
import { decodeClientHeader, encodeClientHeader, parseClientToken } from "../headers/client";

describe("Client Headers", () => {
  let privateKey: KeyObject;
  let publicKey: KeyObject;
  let clientId: string;

  beforeEach(() => {
    const { publicKey: publicKeyB64, privateKey: privateKeyB64 } = generateKeys();

    privateKey = importPrivateKey(privateKeyB64);
    publicKey = importPublicKey(publicKeyB64);

    clientId = randomUUID();
  });

  describe("decodeClientHeader()", () => {
    test("should generate a valid header value", () => {
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
      const features = [FEATURES.CLEAN_WEB, FEATURES.ONE_PASS];

      const headerValue = encodeClientHeader({ version: CURRENT_PROTOCOL_VERSION, expiresAt, features }, privateKey);

      expect(typeof headerValue).toBe("string");

      expect(decodeClientHeader(headerValue, publicKey)).toEqual({
        expiresAt: new Date(Math.floor(expiresAt.getTime() / 1000) * 1000),
        version: CURRENT_PROTOCOL_VERSION,
        flags: 3,
      });
    });

    test("should include `clientId` when client token contains it", () => {
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
      const features: FEATURES[] = [];

      const headerValue = encodeClientHeader(
        { version: CURRENT_PROTOCOL_VERSION, expiresAt, features, clientId },
        privateKey
      );

      expect(typeof headerValue).toBe("string");

      expect(decodeClientHeader(headerValue, publicKey)).toEqual({
        expiresAt: new Date(Math.floor(expiresAt.getTime() / 1000) * 1000),
        version: CURRENT_PROTOCOL_VERSION,
        clientId,
        flags: 0,
      });
    });

    test("should generate a valid header value with expired token", () => {
      const expiresAt = new Date(Date.now() - 24 * 3600 * 1000);
      const features = [FEATURES.CLEAN_WEB];

      const headerValue = encodeClientHeader({ version: CURRENT_PROTOCOL_VERSION, expiresAt, features }, privateKey);

      expect(typeof headerValue).toBe("string");

      expect(decodeClientHeader(headerValue, publicKey)).toEqual({
        expiresAt: new Date(Math.floor(expiresAt.getTime() / 1000) * 1000),
        version: CURRENT_PROTOCOL_VERSION,
        flags: 1,
      });
    });

    test("should parse as undefined on a forged header value", () => {
      publicKey = importPublicKey(ZEROAD_NETWORK_PUBLIC_KEY);

      const expiresAt = new Date(Date.now() - 24 * 3600 * 1000);
      const features = [FEATURES.CLEAN_WEB];

      const headerValue = encodeClientHeader({ version: CURRENT_PROTOCOL_VERSION, expiresAt, features }, privateKey);

      expect(typeof headerValue).toBe("string");
      expect(decodeClientHeader(headerValue, publicKey)).toBeUndefined();
    });
  });

  describe("parseClientToken()", () => {
    test("should construct correct output when token has only CLEAN_WEB feature", () => {
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
      const features = [FEATURES.CLEAN_WEB];
      const headerValue = encodeClientHeader({ version: CURRENT_PROTOCOL_VERSION, expiresAt, features }, privateKey);

      expect(parseClientToken(headerValue, clientId, publicKey)).toEqual({
        ADVERTISEMENTS: false,
        COOKIE_CONSENT_SCREEN: false,
        NON_FUNCTIONAL_TRACKING: false,
        MARKETING_DIALOGS: false,
        CONTENT_PAYWALL: true,
        SUBSCRIPTION_ACCESS: false,
      });
    });

    test("should construct correct output when token has only ONE_PASS feature", () => {
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
      const features = [FEATURES.ONE_PASS];
      const headerValue = encodeClientHeader({ version: CURRENT_PROTOCOL_VERSION, expiresAt, features }, privateKey);

      expect(parseClientToken(headerValue, clientId, publicKey)).toEqual({
        ADVERTISEMENTS: true,
        COOKIE_CONSENT_SCREEN: true,
        NON_FUNCTIONAL_TRACKING: true,
        MARKETING_DIALOGS: true,
        CONTENT_PAYWALL: false,
        SUBSCRIPTION_ACCESS: true,
      });
    });

    test("should construct correct output when token has both CLEAN_WEB and ONE_PASS features", () => {
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
      const features = [FEATURES.CLEAN_WEB, FEATURES.ONE_PASS];
      const headerValue = encodeClientHeader({ version: CURRENT_PROTOCOL_VERSION, expiresAt, features }, privateKey);

      expect(parseClientToken(headerValue, clientId, publicKey)).toEqual({
        ADVERTISEMENTS: false,
        COOKIE_CONSENT_SCREEN: false,
        NON_FUNCTIONAL_TRACKING: false,
        MARKETING_DIALOGS: false,
        CONTENT_PAYWALL: false,
        SUBSCRIPTION_ACCESS: true,
      });
    });

    test("should construct correct output when token has no features", () => {
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
      const features: FEATURES[] = [];
      const headerValue = encodeClientHeader({ version: CURRENT_PROTOCOL_VERSION, expiresAt, features }, privateKey);

      expect(parseClientToken(headerValue, clientId, publicKey)).toEqual({
        ADVERTISEMENTS: true,
        COOKIE_CONSENT_SCREEN: true,
        NON_FUNCTIONAL_TRACKING: true,
        MARKETING_DIALOGS: true,
        CONTENT_PAYWALL: true,
        SUBSCRIPTION_ACCESS: false,
      });
    });

    test("should construct correct output when token has clientId and server's clientId match", () => {
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
      const features: FEATURES[] = [FEATURES.CLEAN_WEB];
      const headerValue = encodeClientHeader(
        { version: CURRENT_PROTOCOL_VERSION, expiresAt, features, clientId },
        privateKey
      );

      expect(parseClientToken(headerValue, clientId, publicKey)).toEqual({
        ADVERTISEMENTS: false,
        COOKIE_CONSENT_SCREEN: false,
        NON_FUNCTIONAL_TRACKING: false,
        MARKETING_DIALOGS: false,
        CONTENT_PAYWALL: true,
        SUBSCRIPTION_ACCESS: false,
      });
    });

    test("should construct correct output when token has clientId and server's clientId do not match", () => {
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
      const features: FEATURES[] = [FEATURES.CLEAN_WEB];
      const headerValue = encodeClientHeader(
        { version: CURRENT_PROTOCOL_VERSION, expiresAt, features, clientId },
        privateKey
      );

      const serverClientId = randomUUID();

      expect(clientId).not.toBe(serverClientId);
      expect(parseClientToken(headerValue, serverClientId, publicKey)).toEqual({
        ADVERTISEMENTS: true,
        COOKIE_CONSENT_SCREEN: true,
        NON_FUNCTIONAL_TRACKING: true,
        MARKETING_DIALOGS: true,
        CONTENT_PAYWALL: true,
        SUBSCRIPTION_ACCESS: false,
      });
    });

    test("should construct correct output when token is expired but clientId and server's clientId match", () => {
      const expiresAt = new Date(Date.now() - 24 * 3600 * 1000);
      const features: FEATURES[] = [FEATURES.CLEAN_WEB, FEATURES.ONE_PASS];
      const headerValue = encodeClientHeader(
        { version: CURRENT_PROTOCOL_VERSION, expiresAt, features, clientId },
        privateKey
      );

      expect(parseClientToken(headerValue, clientId, publicKey)).toEqual({
        ADVERTISEMENTS: true,
        COOKIE_CONSENT_SCREEN: true,
        NON_FUNCTIONAL_TRACKING: true,
        MARKETING_DIALOGS: true,
        CONTENT_PAYWALL: true,
        SUBSCRIPTION_ACCESS: false,
      });
    });

    test("should not throw if array of strings is provided", () => {
      expect(parseClientToken(["some-value", "another-value"], clientId, publicKey)).toEqual({
        ADVERTISEMENTS: true,
        COOKIE_CONSENT_SCREEN: true,
        NON_FUNCTIONAL_TRACKING: true,
        MARKETING_DIALOGS: true,
        CONTENT_PAYWALL: true,
        SUBSCRIPTION_ACCESS: false,
      });
    });

    test("should not throw if an empty array is provided", () => {
      expect(parseClientToken([], clientId, publicKey)).toEqual({
        ADVERTISEMENTS: true,
        COOKIE_CONSENT_SCREEN: true,
        NON_FUNCTIONAL_TRACKING: true,
        MARKETING_DIALOGS: true,
        CONTENT_PAYWALL: true,
        SUBSCRIPTION_ACCESS: false,
      });
    });

    test("should not throw if an undefined param is provided", () => {
      expect(parseClientToken(undefined, clientId, publicKey)).toEqual({
        ADVERTISEMENTS: true,
        COOKIE_CONSENT_SCREEN: true,
        NON_FUNCTIONAL_TRACKING: true,
        MARKETING_DIALOGS: true,
        CONTENT_PAYWALL: true,
        SUBSCRIPTION_ACCESS: false,
      });
    });
  });
});
