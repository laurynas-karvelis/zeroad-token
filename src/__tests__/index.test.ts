import { describe, expect, test } from "bun:test"
import * as publicApi from "../index"

/**
 * The published surface, asserted deliberately. Anything added here is a promise to keep working;
 * anything removed is a breaking change for every publisher on the network.
 */
const EXPECTED_EXPORTS = [
  "AUTHORITY_PUBLIC_KEY",
  "DEFAULT_CACHE_OPTIONS",
  "PLAN",
  "PLAN_NAME",
  "PROTOCOL_VERSION",
  "PUBLISHER_HEADER",
  "REJECTED",
  "TOKEN_BYTES",
  "TOKEN_CHARACTERS",
  "TOKEN_HEADER",
  "TOKEN_HEADER_LOWERCASE",
  "canonicalHostname",
  "createPublisher",
  "encodePublisherHeader",
  "parsePublisherHeader",
].sort()

describe("public API", () => {
  test("exports exactly what is documented, and nothing else", () => {
    expect(Object.keys(publicApi).sort()).toEqual(EXPECTED_EXPORTS)
  })

  test("does not leak issuance or signing helpers", () => {
    // This package verifies. Anything able to mint a token belongs behind the platform's own auth
    for (const name of Object.keys(publicApi)) {
      expect(name).not.toMatch(/sign|issue|mint|generateKey|privateKey/i)
    }
  })

  test("ships the header names a publisher wires up", () => {
    expect(publicApi.PUBLISHER_HEADER).toBe("Better-Web-Publisher")
    expect(publicApi.TOKEN_HEADER).toBe("Better-Web-Token")
    expect(publicApi.TOKEN_HEADER_LOWERCASE).toBe("better-web-token")
  })

  test("ships a usable platform public key", () => {
    expect(publicApi.AUTHORITY_PUBLIC_KEY).toMatch(/^[A-Za-z0-9+/]+=*$/)
    expect(() =>
      publicApi.createPublisher({
        publisherId: "pub_x",
        hostnames: "example.com",
      })
    ).not.toThrow()
  })

  test("describes the single plan on offer", () => {
    expect(publicApi.PLAN).toEqual({ FREEDOM: 1 })
    expect(publicApi.PLAN_NAME[publicApi.PLAN.FREEDOM]).toBe("Freedom")
  })

  test("enumerates every rejection reason a publisher can branch on", () => {
    expect(Object.values(publicApi.REJECTED).sort()).toEqual([
      "expired",
      "forged",
      "malformed",
      "missing",
      "unknown_hostname",
      "unsupported_version",
      "wrong_hostname",
    ])
  })
})
