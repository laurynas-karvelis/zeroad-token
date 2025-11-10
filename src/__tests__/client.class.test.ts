import { describe, test, expect } from "bun:test";
import { generateKeys } from "../subtle.crypto";
import { ClientHeader } from "../headers/client.class";
import { CURRENT_PROTOCOL_VERSION, SITE_FEATURES, ZEROAD_NETWORK_PUBLIC_KEY } from "../constants";

describe("ClientHeader class", () => {
  test("should generate a valid header value", async () => {
    const { publicKey, privateKey } = await generateKeys();
    const header = new ClientHeader(publicKey, privateKey);

    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
    const features = [
      SITE_FEATURES.ADLESS_EXPERIENCE,
      SITE_FEATURES.PREMIUM_CONTENT_ACCESS,
      SITE_FEATURES.VIP_EXPERIENCE,
    ];

    const headerValue = await header.encode(CURRENT_PROTOCOL_VERSION, expiresAt, features);

    expect(typeof headerValue).toBe("string");

    const payload = await header.decode(headerValue);
    expect(payload).toEqual({
      expiresAt: new Date(Math.floor(expiresAt.getTime() / 1000) * 1000),
      version: CURRENT_PROTOCOL_VERSION,
      expired: false,
      flags: 7,
    });
  });

  test("should generate a valid header value with expired flag set to false", async () => {
    const { publicKey, privateKey } = await generateKeys();
    const header = new ClientHeader(publicKey, privateKey);

    const expiresAt = new Date(Date.now() - 24 * 3600 * 1000);
    const features = [
      SITE_FEATURES.ADLESS_EXPERIENCE,
      SITE_FEATURES.PREMIUM_CONTENT_ACCESS,
      SITE_FEATURES.VIP_EXPERIENCE,
    ];

    const headerValue = await header.encode(CURRENT_PROTOCOL_VERSION, expiresAt, features);

    expect(typeof headerValue).toBe("string");

    const payload = await header.decode(headerValue);
    expect(payload).toEqual({
      expiresAt: new Date(Math.floor(expiresAt.getTime() / 1000) * 1000),
      version: CURRENT_PROTOCOL_VERSION,
      expired: true,
      flags: 7,
    });
  });

  test("should parse as null on a forged header value", async () => {
    const { privateKey } = await generateKeys();
    const header = new ClientHeader(ZEROAD_NETWORK_PUBLIC_KEY, privateKey);

    const expiresAt = new Date(Date.now() - 24 * 3600 * 1000);
    const features = [
      SITE_FEATURES.ADLESS_EXPERIENCE,
      SITE_FEATURES.PREMIUM_CONTENT_ACCESS,
      SITE_FEATURES.VIP_EXPERIENCE,
    ];

    const headerValue = await header.encode(CURRENT_PROTOCOL_VERSION, expiresAt, features);

    expect(typeof headerValue).toBe("string");

    const payload = await header.decode(headerValue);
    expect(payload).toBeUndefined();
  });
});
