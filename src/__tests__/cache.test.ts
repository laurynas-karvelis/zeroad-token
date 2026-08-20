import { afterEach, beforeEach, describe, expect, setSystemTime, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { CURRENT_PROTOCOL_VERSION, FEATURE } from "../constants"
import { generateKeys } from "../crypto"
import { encodeClientHeader, parseClientToken } from "../headers/client"
import { configureCaching, getCacheConfig, headerCache } from "../headers/client/cache"

const DEFAULT_CACHE_CONFIG = { enabled: true, maxSize: 100, ttl: 5000 }

describe("Client header cache", () => {
  let privateKey: string
  let publicKey: string
  let clientId: string

  function tokenFor(expiresInMs = 3600 * 1000, features = [FEATURE.CLEAN_WEB]) {
    return encodeClientHeader(
      {
        version: CURRENT_PROTOCOL_VERSION,
        expiresAt: new Date(Date.now() + expiresInMs),
        features,
      },
      privateKey
    )
  }

  beforeEach(() => {
    const keys = generateKeys()

    privateKey = keys.privateKey
    publicKey = keys.publicKey
    clientId = randomUUID()

    headerCache.clear()
    configureCaching(DEFAULT_CACHE_CONFIG)
  })

  afterEach(() => {
    // The cache and its configuration are module-level singletons shared with every other test file
    setSystemTime()
    headerCache.clear()
    configureCaching(DEFAULT_CACHE_CONFIG)
  })

  test("should serve a repeated parse of the same header from the cache", async () => {
    const headerValue = await tokenFor()
    const options = { clientId, publicKey, features: [FEATURE.CLEAN_WEB] }

    const first = await parseClientToken(headerValue, options)
    expect(headerCache.size).toBe(1)
    expect(headerCache.get(headerValue)?.accessCount).toBe(1)

    const second = await parseClientToken(headerValue, options)
    expect(headerCache.get(headerValue)?.accessCount).toBe(2)
    expect(second).toEqual(first)
  })

  test("should not reuse an entry that was verified against a different public key", async () => {
    // The cache used to key on the header value alone, so a token accepted under one trusted key
    // was replayed as valid under any other key parsed afterwards in the same process
    const trusted = generateKeys()
    const headerValue = await encodeClientHeader(
      {
        version: CURRENT_PROTOCOL_VERSION,
        expiresAt: new Date(Date.now() + 3600 * 1000),
        features: [FEATURE.CLEAN_WEB],
      },
      trusted.privateKey
    )

    const underTrustedKey = await parseClientToken(headerValue, {
      clientId,
      publicKey: trusted.publicKey,
      features: [FEATURE.CLEAN_WEB],
    })
    expect(underTrustedKey.HIDE_ADVERTISEMENTS).toBe(true)

    const underOtherKey = await parseClientToken(headerValue, {
      clientId,
      publicKey,
      features: [FEATURE.CLEAN_WEB],
    })
    expect(underOtherKey.HIDE_ADVERTISEMENTS).toBe(false)

    // The re-verification result replaces the stale entry rather than accumulating alongside it
    expect(headerCache.size).toBe(1)
    expect(headerCache.get(headerValue)?.publicKey).toBe(publicKey)
  })

  test("should record the public key a negative result was produced under", async () => {
    const headerValue = await tokenFor()

    await parseClientToken(headerValue, {
      clientId,
      features: [FEATURE.CLEAN_WEB],
    })

    const entry = headerCache.get(headerValue)
    expect(entry?.data).toBeUndefined()
    expect(entry?.publicKey).not.toBe(publicKey)
  })

  test("should neither read nor write the cache when bypassCache is set", async () => {
    const headerValue = await tokenFor()
    const options = {
      clientId,
      publicKey,
      features: [FEATURE.CLEAN_WEB],
      bypassCache: true,
    }

    await parseClientToken(headerValue, options)
    expect(headerCache.size).toBe(0)

    await parseClientToken(headerValue, {
      clientId,
      publicKey,
      features: [FEATURE.CLEAN_WEB],
    })
    expect(headerCache.size).toBe(1)

    // An existing entry is left untouched, including its access count
    await parseClientToken(headerValue, options)
    expect(headerCache.get(headerValue)?.accessCount).toBe(1)
  })

  test("should clear the cache and stop populating it once caching is disabled", async () => {
    const headerValue = await tokenFor()

    await parseClientToken(headerValue, {
      clientId,
      publicKey,
      features: [FEATURE.CLEAN_WEB],
    })
    expect(headerCache.size).toBe(1)

    configureCaching({ enabled: false })
    expect(headerCache.size).toBe(0)

    await parseClientToken(headerValue, {
      clientId,
      publicKey,
      features: [FEATURE.CLEAN_WEB],
    })
    expect(headerCache.size).toBe(0)
  })

  test("should cap the entry lifetime at the token expiry when it lands before the cache TTL", async () => {
    configureCaching({ ttl: 60_000 })

    const shortLived = await tokenFor(2000)
    await parseClientToken(shortLived, {
      clientId,
      publicKey,
      features: [FEATURE.CLEAN_WEB],
    })

    const entry = headerCache.get(shortLived)
    expect(entry?.effectiveExpiry).toBe(entry?.data?.expiresAt.getTime() as number)
    expect((entry?.effectiveExpiry as number) - Date.now()).toBeLessThan(60_000)
  })

  test("should cap the entry lifetime at the cache TTL when the token outlives it", async () => {
    configureCaching({ ttl: 5000 })

    const longLived = await tokenFor(3600 * 1000)
    const before = Date.now()
    await parseClientToken(longLived, {
      clientId,
      publicKey,
      features: [FEATURE.CLEAN_WEB],
    })

    const entry = headerCache.get(longLived)
    expect(entry?.effectiveExpiry).toBeGreaterThanOrEqual(before + 5000)
    expect(entry?.effectiveExpiry).toBeLessThanOrEqual(Date.now() + 5000)
  })

  test("should drop and re-verify an entry once its lifetime has passed", async () => {
    configureCaching({ ttl: 1000 })

    const headerValue = await tokenFor()
    const options = { clientId, publicKey, features: [FEATURE.CLEAN_WEB] }

    await parseClientToken(headerValue, options)
    expect(headerCache.get(headerValue)?.accessCount).toBe(1)

    setSystemTime(new Date(Date.now() + 1001))
    await parseClientToken(headerValue, options)

    // A fresh entry, not an incremented one
    expect(headerCache.get(headerValue)?.accessCount).toBe(1)
    expect(headerCache.size).toBe(1)
  })

  test("should evict the least valuable entry once maxSize is exceeded", async () => {
    configureCaching({ maxSize: 3 })

    const options = { clientId, publicKey, features: [FEATURE.CLEAN_WEB] }
    const [hot, warm, cold] = [await tokenFor(), await tokenFor(), await tokenFor()]

    await parseClientToken(hot, options)
    await parseClientToken(hot, options)
    await parseClientToken(hot, options)
    await parseClientToken(warm, options)
    await parseClientToken(warm, options)
    await parseClientToken(cold, options)

    expect(headerCache.size).toBe(3)

    await parseClientToken(await tokenFor(), options)

    expect(headerCache.size).toBe(3)
    expect(headerCache.has(cold)).toBe(false)
    expect(headerCache.has(warm)).toBe(true)
    expect(headerCache.has(hot)).toBe(true)
  })

  test("should evict several entries at once when maxSize is lowered", async () => {
    configureCaching({ maxSize: 10 })

    const options = { clientId, publicKey, features: [FEATURE.CLEAN_WEB] }
    const headerValues = []

    for (let index = 0; index < 6; index++) {
      const headerValue = await tokenFor()
      headerValues.push(headerValue)

      // Access counts ascending, so the survivors are deterministic
      for (let access = 0; access <= index; access++) await parseClientToken(headerValue, options)
    }

    expect(headerCache.size).toBe(6)

    configureCaching({ maxSize: 2 })

    expect(headerCache.size).toBe(2)
    expect(headerCache.has(headerValues[5])).toBe(true)
    expect(headerCache.has(headerValues[4])).toBe(true)
    expect(headerCache.has(headerValues[0])).toBe(false)
  })

  test("should break access count ties by preferring the newer entry", async () => {
    configureCaching({ maxSize: 2 })

    const options = { clientId, publicKey, features: [FEATURE.CLEAN_WEB] }
    const oldest = await tokenFor()

    await parseClientToken(oldest, options)

    setSystemTime(new Date(Date.now() + 10))
    const middle = await tokenFor()
    await parseClientToken(middle, options)

    setSystemTime(new Date(Date.now() + 20))
    const newest = await tokenFor()
    await parseClientToken(newest, options)

    expect(headerCache.has(oldest)).toBe(false)
    expect(headerCache.has(middle)).toBe(true)
    expect(headerCache.has(newest)).toBe(true)
  })

  test("should keep the cache within maxSize across many distinct tokens", async () => {
    configureCaching({ maxSize: 5 })

    const options = { clientId, publicKey, features: [FEATURE.CLEAN_WEB] }

    for (let index = 0; index < 40; index++) {
      await parseClientToken(await tokenFor(), options)
      expect(headerCache.size).toBeLessThanOrEqual(5)
    }
  })

  describe("configureCaching()", () => {
    test("should reject an out of range configuration", () => {
      expect(() => configureCaching({ ttl: -1 })).toThrow(/Cache TTL must be >= 0/)
      expect(() => configureCaching({ maxSize: 0 })).toThrow(/Cache maxSize must be >= 1/)
      expect(() => configureCaching({ maxSize: -5 })).toThrow(/Cache maxSize must be >= 1/)
    })

    test("should leave the configuration untouched when validation fails", () => {
      expect(() => configureCaching({ enabled: false, ttl: -1 })).toThrow()
      expect(getCacheConfig()).toEqual(DEFAULT_CACHE_CONFIG)
    })

    test("should merge a partial configuration over the current one", () => {
      configureCaching({ ttl: 1234 })
      expect(getCacheConfig()).toEqual({ ...DEFAULT_CACHE_CONFIG, ttl: 1234 })

      configureCaching({ maxSize: 7 })
      expect(getCacheConfig()).toEqual({
        ...DEFAULT_CACHE_CONFIG,
        ttl: 1234,
        maxSize: 7,
      })
    })

    test("should accept a zero TTL, making every parse a miss", async () => {
      configureCaching({ ttl: 0 })

      const headerValue = await tokenFor()
      const options = { clientId, publicKey, features: [FEATURE.CLEAN_WEB] }

      await parseClientToken(headerValue, options)
      await parseClientToken(headerValue, options)

      expect(headerCache.get(headerValue)?.accessCount).toBe(1)
    })

    test("should return a copy of the configuration rather than the live object", () => {
      const config = getCacheConfig() as { maxSize: number }
      config.maxSize = 1

      expect(getCacheConfig().maxSize).toBe(DEFAULT_CACHE_CONFIG.maxSize)
    })
  })
})
