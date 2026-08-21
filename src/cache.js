export const DEFAULT_CACHE_OPTIONS = Object.freeze({
    enabled: true,
    maxSize: 1000,
    ttl: 600_000,
});
/** Entries are swept for expiry every N writes rather than on a timer, so an idle process stays idle. */
const SWEEP_INTERVAL = 128;
function validate(options) {
    if (options.ttl !== undefined && !(options.ttl >= 0))
        throw new Error("Cache `ttl` must be a number >= 0");
    if (options.maxSize !== undefined && !(options.maxSize >= 1))
        throw new Error("Cache `maxSize` must be a number >= 1");
}
/** Least valuable first: fewest hits, oldest breaking the tie. */
function isLessValuable(candidate, incumbent) {
    if (candidate.hits !== incumbent.hits)
        return candidate.hits < incumbent.hits;
    return candidate.storedAt < incumbent.storedAt;
}
export function createResultCache(overrides = {}) {
    validate(overrides);
    const options = { ...DEFAULT_CACHE_OPTIONS, ...overrides };
    const entries = new Map();
    let hits = 0;
    let misses = 0;
    let evictions = 0;
    let writesSinceSweep = 0;
    function sweep(now) {
        for (const [key, entry] of entries) {
            if (entry.goodUntil <= now)
                entries.delete(key);
        }
    }
    function evictOne() {
        let weakestKey;
        let weakest;
        for (const [key, entry] of entries) {
            if (!weakest || isLessValuable(entry, weakest)) {
                weakestKey = key;
                weakest = entry;
            }
        }
        if (weakestKey !== undefined) {
            entries.delete(weakestKey);
            evictions++;
        }
    }
    return {
        get(key, now) {
            if (!options.enabled)
                return undefined;
            const entry = entries.get(key);
            if (!entry) {
                misses++;
                return undefined;
            }
            if (entry.goodUntil <= now) {
                entries.delete(key);
                misses++;
                return undefined;
            }
            entry.hits++;
            hits++;
            return entry.verdict;
        },
        set(key, verdict, now) {
            if (!options.enabled)
                return;
            // A success is never trusted past the token's own expiry, however generous the TTL is
            const ttlExpiry = now + options.ttl;
            const goodUntil = verdict.subscriber ? Math.min(ttlExpiry, verdict.expiresAt * 1000) : ttlExpiry;
            if (goodUntil <= now)
                return;
            entries.set(key, { verdict, goodUntil, hits: 0, storedAt: now });
            // Counting writes rather than checking the entry count, because eviction pins the size at
            // `maxSize` and a size-based trigger would stop firing the moment the cache filled up
            if (++writesSinceSweep >= SWEEP_INTERVAL) {
                writesSinceSweep = 0;
                sweep(now);
            }
            while (entries.size > options.maxSize)
                evictOne();
        },
        clear() {
            entries.clear();
        },
        stats() {
            return {
                size: entries.size,
                maxSize: options.maxSize,
                hits,
                misses,
                evictions,
            };
        },
    };
}
