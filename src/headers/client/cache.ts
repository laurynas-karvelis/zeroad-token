import { log } from "../../logger"
import type { DecodedClientHeader } from "."

export interface CacheConfig {
  enabled: boolean
  maxSize: number
  ttl: number // milliseconds
}

const DEFAULT_CACHE_CONFIG: CacheConfig = {
  enabled: true,
  maxSize: 100,
  ttl: 5000, // 5 seconds
}

export let cacheConfig: CacheConfig = { ...DEFAULT_CACHE_CONFIG }

export function configureCaching(config: Partial<CacheConfig>): void {
  if (config.ttl !== undefined && config.ttl < 0) {
    throw new Error("Cache TTL must be >= 0")
  }

  if (config.maxSize !== undefined && config.maxSize < 1) {
    throw new Error("Cache maxSize must be >= 1")
  }

  cacheConfig = { ...cacheConfig, ...config }

  if (!cacheConfig.enabled) {
    headerCache.clear()
  }

  trimCache()
  log("debug", "Cache configuration updated", cacheConfig)
}

export function getCacheConfig(): Readonly<CacheConfig> {
  return { ...cacheConfig }
}

interface CacheEntry {
  data: DecodedClientHeader | undefined
  effectiveExpiry: number // `min()` of cache TTL expiry and token `expiresAt`
  accessCount: number
  timestamp: number
  publicKey: string // The key the entry was verified against - a hit under a different key must not be reused
}

export const headerCache = new Map<string, CacheEntry>()

function isLessValuable(candidate: CacheEntry, current: CacheEntry): boolean {
  // Least valuable first: lowest access count (LFU), oldest entry breaking ties (LRU)
  if (candidate.accessCount !== current.accessCount) return candidate.accessCount < current.accessCount
  return candidate.timestamp < current.timestamp
}

export function trimCache(): void {
  if (headerCache.size <= cacheConfig.maxSize) return

  const entriesToRemove = headerCache.size - cacheConfig.maxSize

  // The steady state is a single eviction per insert once the cache is full, which a linear scan
  // for the least valuable entry handles without copying and sorting the whole map every time
  if (entriesToRemove === 1) {
    let leastValuableKey: string | undefined
    let leastValuable: CacheEntry | undefined

    for (const [key, entry] of headerCache) {
      if (!leastValuable || isLessValuable(entry, leastValuable)) {
        leastValuableKey = key
        leastValuable = entry
      }
    }

    if (leastValuableKey !== undefined) headerCache.delete(leastValuableKey)
    return
  }

  const entries = Array.from(headerCache.entries())
  entries.sort((a, b) => a[1].accessCount - b[1].accessCount || a[1].timestamp - b[1].timestamp)

  for (let i = 0; i < entriesToRemove; i++) {
    headerCache.delete(entries[i][0])
  }
}

export function cleanExpiredEntries(now: number): void {
  for (const [key, entry] of headerCache.entries()) {
    if (entry.effectiveExpiry <= now) {
      headerCache.delete(key)
    }
  }
}
