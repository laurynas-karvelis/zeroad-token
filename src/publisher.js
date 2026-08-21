import { createResultCache } from "./cache";
import { AUTHORITY_PUBLIC_KEY, PUBLISHER_HEADER, TOKEN_HEADER, TOKEN_HEADER_LOWERCASE } from "./constants";
import { rawPublicKeyFromSpkiBase64 } from "./ed25519";
import { canonicalHostname } from "./hostname";
import { encodePublisherHeader } from "./publisher-header";
import { REJECTED } from "./rejection";
import { TOKEN_CHARACTERS } from "./token";
import { isCacheable, toResult, verifyToken } from "./verify";
function resolveCacheOptions(cache) {
    if (cache === false)
        return { enabled: false };
    if (cache === true || cache === undefined)
        return {};
    return cache;
}
/**
 * Everything a publisher needs, built once at startup and reused for the life of the process.
 *
 * ```ts
 * const publisher = createPublisher({ publisherId: "pub_...", hostnames: "example.com" })
 *
 * response.setHeader(...publisher.header)
 * const visitor = await publisher.verify(request.headers[publisher.tokenHeaderNameLowercase])
 *
 * if (visitor.subscriber) {
 *   // no ads, no trackers, no consent dialog, no paywall
 * }
 * ```
 */
export function createPublisher(options) {
    const headerValue = encodePublisherHeader(options.publisherId);
    const configured = Array.isArray(options.hostnames) ? options.hostnames : [options.hostnames];
    const hostnames = configured.map(canonicalHostname).filter((hostname) => hostname.length > 0);
    if (!hostnames.length) {
        throw new Error('At least one hostname must be provided, e.g. `hostnames: "example.com"`');
    }
    const allowed = new Set(hostnames);
    const soleHostname = hostnames.length === 1 ? hostnames[0] : undefined;
    const authorityPublicKey = rawPublicKeyFromSpkiBase64(options.publicKey ?? AUTHORITY_PUBLIC_KEY);
    const clockToleranceSeconds = options.clockToleranceSeconds ?? 60;
    if (!(clockToleranceSeconds >= 0)) {
        throw new Error("`clockToleranceSeconds` must be a number >= 0");
    }
    const cache = createResultCache(resolveCacheOptions(options.cache));
    return {
        publisherId: options.publisherId,
        hostnames,
        headerName: PUBLISHER_HEADER,
        headerValue,
        header: Object.freeze([PUBLISHER_HEADER, headerValue]),
        tokenHeaderName: TOKEN_HEADER,
        tokenHeaderNameLowercase: TOKEN_HEADER_LOWERCASE,
        async verify(token, hostname) {
            // Node hands back an array when a header arrives more than once. The first wins; a second token
            // is not a merge case, and picking one deterministically beats rejecting the request outright
            const value = typeof token === "string" ? token : Array.isArray(token) ? token[0] : undefined;
            const target = hostname === undefined ? soleHostname : canonicalHostname(hostname);
            if (target === undefined) {
                throw new Error("This publisher serves several hostnames, so `verify()` needs one: `verify(token, request.headers.host)`");
            }
            if (!allowed.has(target)) {
                return toResult({ subscriber: false, reason: REJECTED.UNKNOWN_HOSTNAME }, target, false);
            }
            if (!value) {
                return toResult({ subscriber: false, reason: REJECTED.MISSING }, target, false);
            }
            // Bounding the key length before it can reach the cache, alongside the exact-length check inside
            // `readToken`, is what keeps a flood of oversized headers from being expensive
            if (value.length !== TOKEN_CHARACTERS) {
                return toResult({ subscriber: false, reason: REJECTED.MALFORMED }, target, false);
            }
            const now = Date.now();
            const key = `${target} ${value}`;
            const cached = cache.get(key, now);
            if (cached)
                return toResult(cached, target, true);
            const verdict = await verifyToken(value, target, authorityPublicKey, Math.floor(now / 1000), clockToleranceSeconds);
            if (isCacheable(verdict))
                cache.set(key, verdict, now);
            return toResult(verdict, target, false);
        },
        cacheStats: () => cache.stats(),
        clearCache: () => cache.clear(),
    };
}
