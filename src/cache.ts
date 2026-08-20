import type { Plan } from "./constants"
import type { Rejected } from "./rejection"

/**
 * Verification result cache.
 *
 * A token is bound to one hostname and reused by the extension for the whole of its life, so a busy
 * site sees the same 232 characters on every request from a returning visitor. Verifying it once and
 * remembering the answer turns a 74us pair of curve operations into a map lookup.
 *
 * Failures are cached alongside successes, and for the same reason: a forged or replayed token costs
 * exactly as much to reject as a real one costs to accept, and an attacker who is going to retry is
 * going to retry with the same bytes. Caching a negative is safe because, for a fixed public key, no
 * rejection can later turn into an acceptance - the only direction a verdict can move is valid to
 * expired, which the entry's own expiry already handles.
 *
 * Only verdicts that actually cost cryptography are stored. A malformed token is rejected in about a
 * microsecond by a length check, so caching one would buy nothing while letting anybody who can send
 * requests fill memory with distinct junk keys.
 */

export type CacheOptions = {
  /** Set `false` to verify every request from scratch. */
  enabled: boolean
  /** Maximum entries held. Roughly 700 bytes each, so the default costs well under a megabyte. */
  maxSize: number
  /** Milliseconds a verdict is trusted for. A successful verdict never outlives the token itself. */
  ttl: number
}

export const DEFAULT_CACHE_OPTIONS: Readonly<CacheOptions> = Object.freeze({
  enabled: true,
  maxSize: 1000,
  ttl: 600_000,
})

/** The part of a verdict worth remembering. Rebuilt into a public result on every hit. */
export type CachedVerdict =
  { subscriber: true; plan: Plan; expiresAt: number } | { subscriber: false; reason: Rejected }

type Entry = {
  verdict: CachedVerdict
  /** Wall-clock millisecond at which this entry stops being trusted. */
  goodUntil: number
  hits: number
  storedAt: number
}

export type CacheStats = {
  size: number
  maxSize: number
  hits: number
  misses: number
  evictions: number
}

export type ResultCache = {
  get(key: string, now: number): CachedVerdict | undefined
  set(key: string, verdict: CachedVerdict, now: number): void
  clear(): void
  stats(): CacheStats
}

/** Entries are swept for expiry every N writes rather than on a timer, so an idle process stays idle. */
const SWEEP_INTERVAL = 128

function validate(options: Partial<CacheOptions>): void {
  if (options.ttl !== undefined && !(options.ttl >= 0)) throw new Error("Cache `ttl` must be a number >= 0")
  if (options.maxSize !== undefined && !(options.maxSize >= 1)) throw new Error("Cache `maxSize` must be a number >= 1")
}

/** Least valuable first: fewest hits, oldest breaking the tie. */
function isLessValuable(candidate: Entry, incumbent: Entry): boolean {
  if (candidate.hits !== incumbent.hits) return candidate.hits < incumbent.hits
  return candidate.storedAt < incumbent.storedAt
}

export function createResultCache(overrides: Partial<CacheOptions> = {}): ResultCache {
  validate(overrides)

  const options: CacheOptions = { ...DEFAULT_CACHE_OPTIONS, ...overrides }
  const entries = new Map<string, Entry>()

  let hits = 0
  let misses = 0
  let evictions = 0
  let writesSinceSweep = 0

  function sweep(now: number): void {
    for (const [key, entry] of entries) {
      if (entry.goodUntil <= now) entries.delete(key)
    }
  }

  function evictOne(): void {
    let weakestKey: string | undefined
    let weakest: Entry | undefined

    for (const [key, entry] of entries) {
      if (!weakest || isLessValuable(entry, weakest)) {
        weakestKey = key
        weakest = entry
      }
    }

    if (weakestKey !== undefined) {
      entries.delete(weakestKey)
      evictions++
    }
  }

  return {
    get(key, now) {
      if (!options.enabled) return undefined

      const entry = entries.get(key)
      if (!entry) {
        misses++
        return undefined
      }

      if (entry.goodUntil <= now) {
        entries.delete(key)
        misses++
        return undefined
      }

      entry.hits++
      hits++
      return entry.verdict
    },

    set(key, verdict, now) {
      if (!options.enabled) return

      // A success is never trusted past the token's own expiry, however generous the TTL is
      const ttlExpiry = now + options.ttl
      const goodUntil = verdict.subscriber ? Math.min(ttlExpiry, verdict.expiresAt * 1000) : ttlExpiry

      if (goodUntil <= now) return

      entries.set(key, { verdict, goodUntil, hits: 0, storedAt: now })

      // Counting writes rather than checking the entry count, because eviction pins the size at
      // `maxSize` and a size-based trigger would stop firing the moment the cache filled up
      if (++writesSinceSweep >= SWEEP_INTERVAL) {
        writesSinceSweep = 0
        sweep(now)
      }

      while (entries.size > options.maxSize) evictOne()
    },

    clear() {
      entries.clear()
    },

    stats() {
      return {
        size: entries.size,
        maxSize: options.maxSize,
        hits,
        misses,
        evictions,
      }
    },
  }
}
