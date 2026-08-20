import { type CacheOptions, type CacheStats, createResultCache } from "./cache"
import { AUTHORITY_PUBLIC_KEY, PUBLISHER_HEADER, TOKEN_HEADER, TOKEN_HEADER_LOWERCASE } from "./constants"
import { rawPublicKeyFromSpkiBase64 } from "./ed25519"
import { canonicalHostname } from "./hostname"
import { encodePublisherHeader } from "./publisher-header"
import { REJECTED } from "./rejection"
import { TOKEN_CHARACTERS } from "./token"
import { isCacheable, toResult, type VerificationResult, verifyToken } from "./verify"

export type PublisherOptions = {
  /** From the Zero Ad Network dashboard. Announced to visitors and used to credit the site. */
  publisherId: string

  /**
   * Every hostname this publisher serves, e.g. `"example.com"` or `["example.com", "www.example.com"]`.
   *
   * This is an allowlist, and it is required on purpose. Tokens are bound to a hostname, so verifying
   * against whatever arrived in the `Host` header would mean verifying against an attacker-controlled
   * string: anybody could bind a token to a domain they own, send it with `Host: that-domain.example`,
   * and be admitted as a subscriber. Listing the hostnames here removes that possibility entirely.
   */
  hostnames: string | string[]

  /** Overrides the platform key. For staging and tests - production sites should leave it alone. */
  publicKey?: string

  /** Slack allowed on token expiry, for servers whose clocks drift. Defaults to 60 seconds. */
  clockToleranceSeconds?: number

  /** `false` disables result caching. An object overrides parts of it. See `DEFAULT_CACHE_OPTIONS`. */
  cache?: boolean | Partial<CacheOptions>
}

export type Publisher = {
  readonly publisherId: string
  /** Canonicalised, in the order given. */
  readonly hostnames: readonly string[]

  /** `"Better-Web-Publisher"`. */
  readonly headerName: string
  /** The value to send with it, computed once at startup. */
  readonly headerValue: string
  /** Name and value together, for `response.setHeader(...publisher.header)`. */
  readonly header: readonly [name: string, value: string]

  /** `"Better-Web-Token"`, and its lowercase form, which is how most frameworks key request headers. */
  readonly tokenHeaderName: string
  readonly tokenHeaderNameLowercase: string

  /**
   * Verifies a visitor's token against one of this publisher's hostnames.
   *
   * The hostname may be omitted when exactly one was configured. Pass it explicitly when serving
   * several - `request.headers.host` is fine here, since a value outside the allowlist is rejected
   * rather than trusted.
   */
  verify(token: string | string[] | null | undefined, hostname?: string): Promise<VerificationResult>

  cacheStats(): CacheStats
  clearCache(): void
}

function resolveCacheOptions(cache: PublisherOptions["cache"]): Partial<CacheOptions> {
  if (cache === false) return { enabled: false }
  if (cache === true || cache === undefined) return {}
  return cache
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
export function createPublisher(options: PublisherOptions): Publisher {
  const headerValue = encodePublisherHeader(options.publisherId)

  const configured = Array.isArray(options.hostnames) ? options.hostnames : [options.hostnames]
  const hostnames = configured.map(canonicalHostname).filter((hostname) => hostname.length > 0)

  if (!hostnames.length) {
    throw new Error('At least one hostname must be provided, e.g. `hostnames: "example.com"`')
  }

  const allowed = new Set(hostnames)
  const soleHostname = hostnames.length === 1 ? hostnames[0] : undefined

  const authorityPublicKey = rawPublicKeyFromSpkiBase64(options.publicKey ?? AUTHORITY_PUBLIC_KEY)
  const clockToleranceSeconds = options.clockToleranceSeconds ?? 60

  if (!(clockToleranceSeconds >= 0)) {
    throw new Error("`clockToleranceSeconds` must be a number >= 0")
  }

  const cache = createResultCache(resolveCacheOptions(options.cache))

  return {
    publisherId: options.publisherId,
    hostnames,

    headerName: PUBLISHER_HEADER,
    headerValue,
    header: Object.freeze([PUBLISHER_HEADER, headerValue] as const),

    tokenHeaderName: TOKEN_HEADER,
    tokenHeaderNameLowercase: TOKEN_HEADER_LOWERCASE,

    async verify(token, hostname) {
      // Node hands back an array when a header arrives more than once. The first wins; a second token
      // is not a merge case, and picking one deterministically beats rejecting the request outright
      const value = typeof token === "string" ? token : Array.isArray(token) ? token[0] : undefined

      const target = hostname === undefined ? soleHostname : canonicalHostname(hostname)

      if (target === undefined) {
        throw new Error(
          "This publisher serves several hostnames, so `verify()` needs one: `verify(token, request.headers.host)`"
        )
      }

      if (!allowed.has(target)) {
        return toResult({ subscriber: false, reason: REJECTED.UNKNOWN_HOSTNAME }, target, false)
      }

      if (!value) {
        return toResult({ subscriber: false, reason: REJECTED.MISSING }, target, false)
      }

      // Bounding the key length before it can reach the cache, alongside the exact-length check inside
      // `readToken`, is what keeps a flood of oversized headers from being expensive
      if (value.length !== TOKEN_CHARACTERS) {
        return toResult({ subscriber: false, reason: REJECTED.MALFORMED }, target, false)
      }

      const now = Date.now()
      const key = `${target} ${value}`

      const cached = cache.get(key, now)
      if (cached) return toResult(cached, target, true)

      const verdict = await verifyToken(
        value,
        target,
        authorityPublicKey,
        Math.floor(now / 1000),
        clockToleranceSeconds
      )

      if (isCacheable(verdict)) cache.set(key, verdict, now)

      return toResult(verdict, target, false)
    },

    cacheStats: () => cache.stats(),
    clearCache: () => cache.clear(),
  }
}
