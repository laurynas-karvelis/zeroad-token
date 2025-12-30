import { randomUUID } from "crypto";
import { describe, test, expect, beforeEach } from "bun:test";
import { decodeClientHeader, encodeClientHeader, parseClientToken } from "../headers/client";
import { CURRENT_PROTOCOL_VERSION, FEATURE, ZEROAD_NETWORK_PUBLIC_KEY } from "../constants";
import { generateKeys } from "../crypto";

describe("Client Headers", () => {
  let privateKey: string;
  let publicKey: string;
  let clientId: string;

  beforeEach(() => {
    const keys = generateKeys();

    privateKey = keys.privateKey;
    publicKey = keys.publicKey;

    clientId = randomUUID();
  });

  describe("decodeClientHeader()", () => {
    test("should generate a valid header value", async () => {
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
      const features = [FEATURE.CLEAN_WEB, FEATURE.ONE_PASS];

      const headerValue = await encodeClientHeader(
        { version: CURRENT_PROTOCOL_VERSION, expiresAt, features },
        privateKey
      );

      expect(typeof headerValue).toBe("string");

      expect(await decodeClientHeader(headerValue, publicKey)).toEqual({
        expiresAt: new Date(Math.floor(expiresAt.getTime() / 1000) * 1000),
        version: CURRENT_PROTOCOL_VERSION,
        flags: 3,
      });
    });

    test("should include `clientId` when client token contains it", async () => {
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
      const features: FEATURE[] = [];

      const headerValue = await encodeClientHeader(
        { version: CURRENT_PROTOCOL_VERSION, expiresAt, features, clientId },
        privateKey
      );

      expect(typeof headerValue).toBe("string");

      expect(await decodeClientHeader(headerValue, publicKey)).toEqual({
        expiresAt: new Date(Math.floor(expiresAt.getTime() / 1000) * 1000),
        version: CURRENT_PROTOCOL_VERSION,
        clientId,
        flags: 0,
      });
    });

    test("should generate a valid header value with expired token", async () => {
      const expiresAt = new Date(Date.now() - 24 * 3600 * 1000);
      const features = [FEATURE.CLEAN_WEB];

      const headerValue = await encodeClientHeader(
        { version: CURRENT_PROTOCOL_VERSION, expiresAt, features },
        privateKey
      );

      expect(typeof headerValue).toBe("string");

      expect(await decodeClientHeader(headerValue, publicKey)).toEqual({
        expiresAt: new Date(Math.floor(expiresAt.getTime() / 1000) * 1000),
        version: CURRENT_PROTOCOL_VERSION,
        flags: 1,
      });
    });

    test("should parse as undefined on a forged header value", async () => {
      const expiresAt = new Date(Date.now() - 24 * 3600 * 1000);
      const features = [FEATURE.CLEAN_WEB];

      const headerValue = await encodeClientHeader(
        { version: CURRENT_PROTOCOL_VERSION, expiresAt, features },
        privateKey
      );

      expect(typeof headerValue).toBe("string");
      expect(await decodeClientHeader(headerValue, ZEROAD_NETWORK_PUBLIC_KEY)).toBeUndefined();
    });
  });

  describe("parseClientToken()", () => {
    test("should construct correct output when token and site both have CLEAN_WEB feature", async () => {
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
      const features = [FEATURE.CLEAN_WEB];
      const headerValue = await encodeClientHeader(
        { version: CURRENT_PROTOCOL_VERSION, expiresAt, features },
        privateKey
      );

      const tokenContext = await parseClientToken(headerValue, { clientId, publicKey, features });
      expect(tokenContext).toEqual({
        HIDE_ADVERTISEMENTS: true,
        HIDE_COOKIE_CONSENT_SCREEN: true,
        HIDE_MARKETING_DIALOGS: true,
        DISABLE_NON_FUNCTIONAL_TRACKING: true,
        DISABLE_CONTENT_PAYWALL: false,
        ENABLE_SUBSCRIPTION_ACCESS: false,
      });
    });

    test("should construct correct output when token and site both have ONE_PASS feature", async () => {
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
      const features = [FEATURE.ONE_PASS];
      const headerValue = await encodeClientHeader(
        { version: CURRENT_PROTOCOL_VERSION, expiresAt, features },
        privateKey
      );

      const tokenContext = await parseClientToken(headerValue, { clientId, publicKey, features });
      expect(tokenContext).toEqual({
        HIDE_ADVERTISEMENTS: false,
        HIDE_COOKIE_CONSENT_SCREEN: false,
        HIDE_MARKETING_DIALOGS: false,
        DISABLE_NON_FUNCTIONAL_TRACKING: false,
        DISABLE_CONTENT_PAYWALL: true,
        ENABLE_SUBSCRIPTION_ACCESS: true,
      });
    });

    test("should construct correct output when token and site both have CLEAN_WEB and ONE_PASS features", async () => {
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
      const features = [FEATURE.CLEAN_WEB, FEATURE.ONE_PASS];
      const headerValue = await encodeClientHeader(
        { version: CURRENT_PROTOCOL_VERSION, expiresAt, features },
        privateKey
      );

      const tokenContext = await parseClientToken(headerValue, {
        clientId,
        publicKey,
        features,
      });
      expect(tokenContext).toEqual({
        HIDE_ADVERTISEMENTS: true,
        HIDE_COOKIE_CONSENT_SCREEN: true,
        HIDE_MARKETING_DIALOGS: true,
        DISABLE_NON_FUNCTIONAL_TRACKING: true,
        DISABLE_CONTENT_PAYWALL: true,
        ENABLE_SUBSCRIPTION_ACCESS: true,
      });
    });

    test("should construct correct output when token has CLEAN_WEB and site has ONE_PASS feature", async () => {
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
      const headerValue = await encodeClientHeader(
        { version: CURRENT_PROTOCOL_VERSION, expiresAt, features: [FEATURE.CLEAN_WEB] },
        privateKey
      );

      const tokenContext = await parseClientToken(headerValue, {
        clientId,
        publicKey,
        features: [FEATURE.ONE_PASS],
      });

      expect(tokenContext).toEqual({
        HIDE_ADVERTISEMENTS: false,
        HIDE_COOKIE_CONSENT_SCREEN: false,
        HIDE_MARKETING_DIALOGS: false,
        DISABLE_NON_FUNCTIONAL_TRACKING: false,
        DISABLE_CONTENT_PAYWALL: false,
        ENABLE_SUBSCRIPTION_ACCESS: false,
      });
    });

    test("should construct correct output when token has ONE_PASS and site has CLEAN_WEB feature", async () => {
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
      const headerValue = await encodeClientHeader(
        { version: CURRENT_PROTOCOL_VERSION, expiresAt, features: [FEATURE.ONE_PASS] },
        privateKey
      );

      const tokenContext = await parseClientToken(headerValue, {
        clientId,
        publicKey,
        features: [FEATURE.CLEAN_WEB],
      });

      expect(tokenContext).toEqual({
        HIDE_ADVERTISEMENTS: false,
        HIDE_COOKIE_CONSENT_SCREEN: false,
        HIDE_MARKETING_DIALOGS: false,
        DISABLE_NON_FUNCTIONAL_TRACKING: false,
        DISABLE_CONTENT_PAYWALL: false,
        ENABLE_SUBSCRIPTION_ACCESS: false,
      });
    });

    test("should construct correct output when token has both CLEAN_WEB and ONE_PASS but site has CLEAN_WEB feature only", async () => {
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
      const headerValue = await encodeClientHeader(
        { version: CURRENT_PROTOCOL_VERSION, expiresAt, features: [FEATURE.CLEAN_WEB, FEATURE.ONE_PASS] },
        privateKey
      );

      const tokenContext = await parseClientToken(headerValue, {
        clientId,
        publicKey,
        features: [FEATURE.CLEAN_WEB],
      });

      expect(tokenContext).toEqual({
        HIDE_ADVERTISEMENTS: true,
        HIDE_COOKIE_CONSENT_SCREEN: true,
        HIDE_MARKETING_DIALOGS: true,
        DISABLE_NON_FUNCTIONAL_TRACKING: true,
        DISABLE_CONTENT_PAYWALL: false,
        ENABLE_SUBSCRIPTION_ACCESS: false,
      });
    });

    test("should construct correct output when token has both CLEAN_WEB and ONE_PASS but site has ONE_PASS feature only", async () => {
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
      const headerValue = await encodeClientHeader(
        { version: CURRENT_PROTOCOL_VERSION, expiresAt, features: [FEATURE.CLEAN_WEB, FEATURE.ONE_PASS] },
        privateKey
      );

      const tokenContext = await parseClientToken(headerValue, {
        clientId,
        publicKey,
        features: [FEATURE.ONE_PASS],
      });

      expect(tokenContext).toEqual({
        HIDE_ADVERTISEMENTS: false,
        HIDE_COOKIE_CONSENT_SCREEN: false,
        HIDE_MARKETING_DIALOGS: false,
        DISABLE_NON_FUNCTIONAL_TRACKING: false,
        DISABLE_CONTENT_PAYWALL: true,
        ENABLE_SUBSCRIPTION_ACCESS: true,
      });
    });

    test("should construct correct output when token has no features while site supports all features", async () => {
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
      const features: FEATURE[] = [];
      const headerValue = await encodeClientHeader(
        { version: CURRENT_PROTOCOL_VERSION, expiresAt, features },
        privateKey
      );

      const tokenContext = await parseClientToken(headerValue, {
        clientId,
        publicKey,
        features: [FEATURE.CLEAN_WEB, FEATURE.ONE_PASS],
      });
      expect(tokenContext).toEqual({
        HIDE_ADVERTISEMENTS: false,
        HIDE_COOKIE_CONSENT_SCREEN: false,
        HIDE_MARKETING_DIALOGS: false,
        DISABLE_NON_FUNCTIONAL_TRACKING: false,
        DISABLE_CONTENT_PAYWALL: false,
        ENABLE_SUBSCRIPTION_ACCESS: false,
      });
    });

    test("should construct correct output when token has clientId and server's clientId match", async () => {
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
      const features: FEATURE[] = [FEATURE.CLEAN_WEB];
      const headerValue = await encodeClientHeader(
        { version: CURRENT_PROTOCOL_VERSION, expiresAt, features, clientId },
        privateKey
      );

      const tokenContext = await parseClientToken(headerValue, { clientId, publicKey, features });
      expect(tokenContext).toEqual({
        HIDE_ADVERTISEMENTS: true,
        HIDE_COOKIE_CONSENT_SCREEN: true,
        HIDE_MARKETING_DIALOGS: true,
        DISABLE_NON_FUNCTIONAL_TRACKING: true,
        DISABLE_CONTENT_PAYWALL: false,
        ENABLE_SUBSCRIPTION_ACCESS: false,
      });
    });

    test("should construct correct output when token has clientId and server's clientId do not match", async () => {
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
      const features: FEATURE[] = [FEATURE.CLEAN_WEB];
      const headerValue = await encodeClientHeader(
        { version: CURRENT_PROTOCOL_VERSION, expiresAt, features, clientId },
        privateKey
      );

      const differentClientId = randomUUID();
      expect(clientId).not.toEqual(differentClientId);

      const tokenContext = await parseClientToken(headerValue, { clientId: differentClientId, publicKey, features });
      expect(tokenContext).toEqual({
        HIDE_ADVERTISEMENTS: false,
        HIDE_COOKIE_CONSENT_SCREEN: false,
        HIDE_MARKETING_DIALOGS: false,
        DISABLE_NON_FUNCTIONAL_TRACKING: false,
        DISABLE_CONTENT_PAYWALL: false,
        ENABLE_SUBSCRIPTION_ACCESS: false,
      });
    });

    test("should construct correct output when token is expired but clientId and server's clientId match", async () => {
      const expiresAt = new Date(Date.now() - 24 * 3600 * 1000);
      const features: FEATURE[] = [FEATURE.CLEAN_WEB, FEATURE.ONE_PASS];
      const headerValue = await encodeClientHeader(
        { version: CURRENT_PROTOCOL_VERSION, expiresAt, features, clientId },
        privateKey
      );

      const tokenContext = await parseClientToken(headerValue, { clientId, publicKey, features });
      expect(tokenContext).toEqual({
        HIDE_ADVERTISEMENTS: false,
        HIDE_COOKIE_CONSENT_SCREEN: false,
        HIDE_MARKETING_DIALOGS: false,
        DISABLE_NON_FUNCTIONAL_TRACKING: false,
        DISABLE_CONTENT_PAYWALL: false,
        ENABLE_SUBSCRIPTION_ACCESS: false,
      });
    });

    test("should not throw if array of strings is provided", async () => {
      const tokenContext = await parseClientToken(["some-value", "another-value"], {
        clientId,
        publicKey,
        features: [FEATURE.CLEAN_WEB, FEATURE.ONE_PASS],
      });

      expect(tokenContext).toEqual({
        HIDE_ADVERTISEMENTS: false,
        HIDE_COOKIE_CONSENT_SCREEN: false,
        HIDE_MARKETING_DIALOGS: false,
        DISABLE_NON_FUNCTIONAL_TRACKING: false,
        DISABLE_CONTENT_PAYWALL: false,
        ENABLE_SUBSCRIPTION_ACCESS: false,
      });
    });

    test("should not throw if an empty array is provided", async () => {
      const tokenContext = await parseClientToken([], {
        clientId,
        publicKey,
        features: [FEATURE.CLEAN_WEB, FEATURE.ONE_PASS],
      });

      expect(tokenContext).toEqual({
        HIDE_ADVERTISEMENTS: false,
        HIDE_COOKIE_CONSENT_SCREEN: false,
        HIDE_MARKETING_DIALOGS: false,
        DISABLE_NON_FUNCTIONAL_TRACKING: false,
        DISABLE_CONTENT_PAYWALL: false,
        ENABLE_SUBSCRIPTION_ACCESS: false,
      });
    });

    test("should not throw if an undefined param is provided", async () => {
      const tokenContext = await parseClientToken(undefined, {
        clientId,
        publicKey,
        features: [FEATURE.CLEAN_WEB, FEATURE.ONE_PASS],
      });

      expect(tokenContext).toEqual({
        HIDE_ADVERTISEMENTS: false,
        HIDE_COOKIE_CONSENT_SCREEN: false,
        HIDE_MARKETING_DIALOGS: false,
        DISABLE_NON_FUNCTIONAL_TRACKING: false,
        DISABLE_CONTENT_PAYWALL: false,
        ENABLE_SUBSCRIPTION_ACCESS: false,
      });
    });
  });
});
