import { beforeEach, describe, expect, test } from "bun:test"
import { createResultCache, DEFAULT_CACHE_OPTIONS } from "../cache"
import { createPublisher, type Publisher } from "../publisher"
import { REJECTED } from "../rejection"
import { TOKEN_CHARACTERS } from "../token"
import { type Authority, createAuthority, mintToken } from "./__fixtures__/authority"

const HOSTNAME = "example.com"

let authority: Authority

function build(overrides: Partial<Parameters<typeof createPublisher>[0]> = {}): Publisher {
  return createPublisher({
    publisherId: "zapub_7Fq2xR9nKdW3mB6tYp1sVzAe",
    hostnames: HOSTNAME,
    publicKey: authority.publicKey,
    ...overrides,
  })
}

beforeEach(() => {
  authority = createAuthority()
})

describe("caching a good verdict", () => {
  test("verifies once, then serves the same token from memory", async () => {
    const publisher = build()
    const token = mintToken(authority, HOSTNAME)

    const first = await publisher.verify(token)
    const second = await publisher.verify(token)
    const third = await publisher.verify(token)

    expect(first.cached).toBe(false)
    expect(second.cached).toBe(true)
    expect(third.cached).toBe(true)

    expect(publisher.cacheStats()).toMatchObject({
      size: 1,
      hits: 2,
      misses: 1,
    })
  })

  test("a cache hit carries the same verdict as the fresh verification", async () => {
    const publisher = build()
    const token = mintToken(authority, HOSTNAME)

    const fresh = await publisher.verify(token)
    const hit = await publisher.verify(token)

    expect({ ...hit, cached: false }).toEqual(fresh)
  })

  test("keys on hostname as well as token, so one host cannot answer for another", async () => {
    const publisher = build({ hostnames: ["a.example", "b.example"] })
    const token = mintToken(authority, "a.example")

    expect((await publisher.verify(token, "a.example")).subscriber).toBe(true)

    const atB = await publisher.verify(token, "b.example")
    expect(atB).toMatchObject({
      subscriber: false,
      reason: REJECTED.WRONG_HOSTNAME,
      cached: false,
    })
  })
})

describe("caching a bad verdict", () => {
  test("remembers a forged token so the second attempt costs nothing", async () => {
    const publisher = build()
    const forged = mintToken(createAuthority(), HOSTNAME)

    expect(await publisher.verify(forged)).toMatchObject({
      reason: REJECTED.FORGED,
      cached: false,
    })
    expect(await publisher.verify(forged)).toMatchObject({
      reason: REJECTED.FORGED,
      cached: true,
    })
    expect(publisher.cacheStats()).toMatchObject({ size: 1, hits: 1 })
  })

  test("remembers a token replayed from another site", async () => {
    const publisher = build()
    const harvested = mintToken(authority, "somewhere-else.example")

    expect(await publisher.verify(harvested)).toMatchObject({
      reason: REJECTED.WRONG_HOSTNAME,
      cached: false,
    })
    expect(await publisher.verify(harvested)).toMatchObject({
      reason: REJECTED.WRONG_HOSTNAME,
      cached: true,
    })
  })

  test.each([
    ["malformed", "x".repeat(TOKEN_CHARACTERS)],
    ["missing", undefined],
  ])("does not spend cache entries on %s tokens, which cost nothing to reject", async (_label, token) => {
    const publisher = build()

    await publisher.verify(token)
    await publisher.verify(token)

    expect(publisher.cacheStats().size).toBe(0)
  })

  test("an oversized header is discarded before it can become a cache key", async () => {
    const publisher = build()

    for (let index = 0; index < 50; index++) {
      await publisher.verify("z".repeat(100_000) + index)
    }

    expect(publisher.cacheStats().size).toBe(0)
  })

  test("expired tokens are not cached, since the check is already free", async () => {
    const publisher = build()
    const token = mintToken(authority, HOSTNAME, {
      expiresAt: Math.floor(Date.now() / 1000) - 10,
    })

    await publisher.verify(token)
    expect(publisher.cacheStats().size).toBe(0)
  })
})

describe("cache configuration", () => {
  test("can be turned off entirely", async () => {
    const publisher = build({ cache: false })
    const token = mintToken(authority, HOSTNAME)

    expect((await publisher.verify(token)).cached).toBe(false)
    expect((await publisher.verify(token)).cached).toBe(false)
    expect(publisher.cacheStats().size).toBe(0)
  })

  test("`cache: true` means the defaults", async () => {
    const publisher = build({ cache: true })
    const token = mintToken(authority, HOSTNAME)

    await publisher.verify(token)
    expect((await publisher.verify(token)).cached).toBe(true)
    expect(publisher.cacheStats().maxSize).toBe(DEFAULT_CACHE_OPTIONS.maxSize)
  })

  test("a zero TTL disables reuse without disabling the cache", async () => {
    const publisher = build({ cache: { ttl: 0 } })
    const token = mintToken(authority, HOSTNAME)

    await publisher.verify(token)
    expect((await publisher.verify(token)).cached).toBe(false)
  })

  test("clearCache drops everything", async () => {
    const publisher = build()
    const token = mintToken(authority, HOSTNAME)

    await publisher.verify(token)
    publisher.clearCache()

    expect(publisher.cacheStats().size).toBe(0)
    expect((await publisher.verify(token)).cached).toBe(false)
  })

  test("rejects nonsensical settings at construction, not at request time", () => {
    expect(() => build({ cache: { ttl: -1 } })).toThrow(/ttl/)
    expect(() => build({ cache: { maxSize: 0 } })).toThrow(/maxSize/)
  })
})

describe("result cache internals", () => {
  const good = { subscriber: true, plan: 1, expiresAt: 4_000_000_000 } as const
  const bad = { subscriber: false, reason: REJECTED.FORGED } as const

  test("never trusts a verdict past the token's own expiry, however long the TTL", () => {
    const cache = createResultCache({ ttl: 10_000_000 })
    const expiresAt = 1_000_000

    cache.set("k", { subscriber: true, plan: 1, expiresAt }, 999_000_000)
    expect(cache.get("k", 999_500_000)).toBeDefined()
    expect(cache.get("k", expiresAt * 1000 + 1)).toBeUndefined()
  })

  test("drops an entry once its TTL elapses", () => {
    const cache = createResultCache({ ttl: 1000 })

    cache.set("k", bad, 0)
    expect(cache.get("k", 999)).toEqual(bad)
    expect(cache.get("k", 1000)).toBeUndefined()
  })

  test("refuses to store a verdict that is already stale", () => {
    const cache = createResultCache({ ttl: 60_000 })

    cache.set("k", { subscriber: true, plan: 1, expiresAt: 500 }, 1_000_000)
    expect(cache.stats().size).toBe(0)
  })

  test("holds the size at maxSize by evicting the least used entry", () => {
    const cache = createResultCache({ maxSize: 3 })

    cache.set("a", good, 0)
    cache.set("b", good, 1)
    cache.set("c", good, 2)

    // "a" and "c" earn their keep, "b" never gets read again
    cache.get("a", 3)
    cache.get("a", 4)
    cache.get("c", 5)

    cache.set("d", good, 6)

    expect(cache.get("b", 7)).toBeUndefined()
    expect(cache.get("a", 7)).toBeDefined()
    expect(cache.get("c", 7)).toBeDefined()
    expect(cache.get("d", 7)).toBeDefined()
    expect(cache.stats()).toMatchObject({ size: 3, evictions: 1 })
  })

  test("breaks an eviction tie on age, oldest first", () => {
    const cache = createResultCache({ maxSize: 2 })

    cache.set("old", good, 0)
    cache.set("new", good, 100)
    cache.set("newest", good, 200)

    expect(cache.get("old", 300)).toBeUndefined()
    expect(cache.get("new", 300)).toBeDefined()
  })

  test("stays bounded under sustained unique traffic", () => {
    const cache = createResultCache({ maxSize: 50 })

    for (let index = 0; index < 5000; index++) cache.set(`key-${index}`, good, index)

    expect(cache.stats().size).toBe(50)
  })

  test("sweeps expired entries as writes accumulate, without a timer", () => {
    const cache = createResultCache({ maxSize: 10_000, ttl: 100 })

    for (let index = 0; index < 200; index++) cache.set(`key-${index}`, bad, 0)
    expect(cache.stats().size).toBe(200)

    // One write past the expiry horizon triggers the sweep that clears the rest
    for (let index = 0; index < 128; index++) cache.set(`late-${index}`, bad, 1000)

    expect(cache.stats().size).toBeLessThan(200)
  })

  test("counts hits, misses and evictions for capacity planning", () => {
    const cache = createResultCache({ maxSize: 1 })

    cache.get("nothing", 0)
    cache.set("a", good, 0)
    cache.get("a", 1)
    cache.set("b", good, 2)

    expect(cache.stats()).toMatchObject({
      size: 1,
      hits: 1,
      misses: 1,
      evictions: 1,
    })
  })

  test("disabled means nothing is stored or returned", () => {
    const cache = createResultCache({ enabled: false })

    cache.set("a", good, 0)
    expect(cache.get("a", 1)).toBeUndefined()
    expect(cache.stats().size).toBe(0)
  })
})
