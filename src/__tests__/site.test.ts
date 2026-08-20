import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { CLIENT_HEADER, CURRENT_PROTOCOL_VERSION, FEATURE, SERVER_HEADER } from "../constants"
import { generateKeys } from "../crypto"
import * as clientHeader from "../headers/client"
import { encodeClientHeader } from "../headers/client"
import { configureCaching, getCacheConfig, headerCache } from "../headers/client/cache"
import { Site } from "../site"

const DEFAULT_CACHE_CONFIG = { enabled: true, maxSize: 100, ttl: 5000 }

describe("Site()", () => {
  let privateKey: string
  let clientId: string

  beforeEach(() => {
    const keys = generateKeys()

    privateKey = keys.privateKey
    clientId = randomUUID()
  })

  afterEach(() => {
    headerCache.clear()
    configureCaching(DEFAULT_CACHE_CONFIG)
  })

  test("should generate a valid server header", () => {
    const site = Site({
      clientId,
      features: [FEATURE.CLEAN_WEB, FEATURE.ONE_PASS],
    })
    expect(site.SERVER_HEADER_NAME).toEqual(SERVER_HEADER.WELCOME)
    expect(site.SERVER_HEADER_VALUE).toBe(`${clientId}^1^3`)
  })

  test("should contain correct client hello header name", () => {
    const site = Site({ clientId, features: [FEATURE.CLEAN_WEB] })
    expect(site.CLIENT_HEADER_NAME).toEqual(CLIENT_HEADER.HELLO.toLowerCase())
  })

  test("should call parseClientToken() correctly", async () => {
    const features = [FEATURE.CLEAN_WEB, FEATURE.ONE_PASS]
    const site = Site({ clientId, features })

    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000)
    const clientHeaderValue = await encodeClientHeader(
      {
        version: CURRENT_PROTOCOL_VERSION,
        expiresAt,
        features: [FEATURE.CLEAN_WEB],
      },
      privateKey
    )

    spyOn(clientHeader, "parseClientToken")
    const tokenContext = await site.parseClientToken(clientHeaderValue)

    expect(clientHeader.parseClientToken).toHaveBeenCalledTimes(1)
    expect(clientHeader.parseClientToken).toHaveBeenCalledWith(clientHeaderValue, { clientId, features })

    expect(tokenContext).toEqual({
      DISABLE_CONTENT_PAYWALL: false,
      DISABLE_NON_FUNCTIONAL_TRACKING: false,
      ENABLE_SUBSCRIPTION_ACCESS: false,
      HIDE_ADVERTISEMENTS: false,
      HIDE_COOKIE_CONSENT_SCREEN: false,
      HIDE_MARKETING_DIALOGS: false,
    })
  })

  test("should reject an invalid site configuration up front", () => {
    expect(() => Site({ clientId: "", features: [FEATURE.CLEAN_WEB] })).toThrow(
      /The provided `clientId` value cannot be an empty string/
    )
    expect(() => Site({ clientId, features: [] })).toThrow(/At least one site feature must be provided/)
    expect(() => Site({ clientId, features: ["nope"] as never })).toThrow(/Only valid site features are allowed/)
  })

  test("should compute the server header value once at construction time", () => {
    const site = Site({ clientId, features: [FEATURE.CLEAN_WEB] })

    expect(site.SERVER_HEADER_VALUE).toBe(site.SERVER_HEADER_VALUE)
    expect(site.SERVER_HEADER_VALUE).toBe(`${clientId}^1^1`)
  })

  test("should apply a partial cache configuration", () => {
    Site({
      clientId,
      features: [FEATURE.CLEAN_WEB],
      cacheConfig: { ttl: 250 },
    })

    expect(getCacheConfig()).toEqual({ ...DEFAULT_CACHE_CONFIG, ttl: 250 })
  })

  test("should leave the cache configuration alone when none is given", () => {
    configureCaching({ ttl: 777 })
    Site({ clientId, features: [FEATURE.CLEAN_WEB] })

    expect(getCacheConfig().ttl).toBe(777)
  })

  test("should share one cache configuration across every site in the process", () => {
    // Caching is a module-level singleton, so the last site constructed wins - worth pinning
    // because it is a genuine footgun for anyone mounting two sites in one process
    const first = Site({
      clientId,
      features: [FEATURE.CLEAN_WEB],
      cacheConfig: { ttl: 1000 },
    })
    expect(getCacheConfig().ttl).toBe(1000)

    Site({
      clientId: randomUUID(),
      features: [FEATURE.ONE_PASS],
      cacheConfig: { ttl: 2000 },
    })

    expect(first.SERVER_HEADER_VALUE).toBe(`${clientId}^1^1`)
    expect(getCacheConfig().ttl).toBe(2000)
  })

  test("should reject the site's own token when it carries a different clientId", async () => {
    const site = Site({ clientId, features: [FEATURE.CLEAN_WEB] })

    const headerValue = await encodeClientHeader(
      {
        version: CURRENT_PROTOCOL_VERSION,
        expiresAt: new Date(Date.now() + 3600 * 1000),
        features: [FEATURE.CLEAN_WEB],
        clientId: randomUUID(),
      },
      privateKey
    )

    expect((await site.parseClientToken(headerValue)).HIDE_ADVERTISEMENTS).toBe(false)
  })

  test("should deny everything when no client header is present", async () => {
    const site = Site({
      clientId,
      features: [FEATURE.CLEAN_WEB, FEATURE.ONE_PASS],
    })

    expect(await site.parseClientToken(undefined)).toEqual({
      HIDE_ADVERTISEMENTS: false,
      HIDE_COOKIE_CONSENT_SCREEN: false,
      HIDE_MARKETING_DIALOGS: false,
      DISABLE_NON_FUNCTIONAL_TRACKING: false,
      DISABLE_CONTENT_PAYWALL: false,
      ENABLE_SUBSCRIPTION_ACCESS: false,
    })
  })

  test("should expose the client header name lowercased for direct header map lookups", () => {
    const site = Site({ clientId, features: [FEATURE.CLEAN_WEB] })

    expect(site.CLIENT_HEADER_NAME).toBe("x-better-web-hello")
    expect(site.SERVER_HEADER_NAME).toBe("X-Better-Web-Welcome")
  })
})
