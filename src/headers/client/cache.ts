import { DecodedClientHeader } from ".";
import { log } from "../../logger";

export interface CacheConfig {
  enabled: boolean;
  maxSize: number;
  ttl: number; // milliseconds
}

const DEFAULT_CACHE_CONFIG: CacheConfig = {
  enabled: true,
  maxSize: 100,
  ttl: 5000, // 5 seconds
};

export let cacheConfig: CacheConfig = { ...DEFAULT_CACHE_CONFIG };

export function configureCaching(config: Partial<CacheConfig>): void {
  if (config.ttl !== undefined && config.ttl < 0) {
    throw new Error("Cache TTL must be >= 0");
  }

  if (config.maxSize !== undefined && config.maxSize < 1) {
    throw new Error("Cache maxSize must be >= 1");
  }

  cacheConfig = { ...cacheConfig, ...config };

  if (!cacheConfig.enabled) {
    headerCache.clear();
  }

  trimCache();
  log("debug", "Cache configuration updated", cacheConfig);
}

export function getCacheConfig(): Readonly<CacheConfig> {
  return { ...cacheConfig };
}

interface CacheEntry {
  data: DecodedClientHeader | undefined;
  effectiveExpiry: number; // `min()` of cache TTL expiry and token `expiresAt`
  accessCount: number;
  timestamp: number;
}

export const headerCache = new Map<string, CacheEntry>();

export function trimCache(): void {
  if (headerCache.size <= cacheConfig.maxSize) return;

  const entriesToRemove = headerCache.size - cacheConfig.maxSize;
  const entries = Array.from(headerCache.entries());

  // Sort by access count (LFU) and timestamp (LRU) - remove least valuable
  entries.sort((a, b) => {
    if (a[1].accessCount !== b[1].accessCount) {
      return a[1].accessCount - b[1].accessCount;
    }
    return a[1].timestamp - b[1].timestamp;
  });

  for (let i = 0; i < entriesToRemove; i++) {
    headerCache.delete(entries[i][0]);
  }
}

export function cleanExpiredEntries(now: number): void {
  for (const [key, entry] of headerCache.entries()) {
    if (entry.effectiveExpiry <= now) {
      headerCache.delete(key);
    }
  }
}
