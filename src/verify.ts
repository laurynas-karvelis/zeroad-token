import type { CachedVerdict } from "./cache"
import { PLAN_NAME, type Plan } from "./constants"
import { verifyEd25519 } from "./ed25519"
import { REJECTED, type Rejected } from "./rejection"
import {
  authoritySignature,
  credentialMessage,
  ephemeralPublicKey,
  hostnameMessage,
  hostnameSignature,
  readToken,
} from "./token"

/** A visitor holding a live subscription, for whom the site must honour the plan's entitlements. */
export type SubscriberResult = {
  subscriber: true
  plan: Plan
  /** Lowercase plan name, e.g. `"freedom"`. Handy for logs and templates. */
  planName: string
  expiresAt: Date
  /** The hostname the token was verified against. */
  hostname: string
  /** Whether this verdict came from the cache rather than from fresh cryptography. */
  cached: boolean
}

/** Everyone else: no extension, no subscription, or somebody trying it on. */
export type NonSubscriberResult = {
  subscriber: false
  reason: Rejected
  hostname: string
  cached: boolean
}

export type VerificationResult = SubscriberResult | NonSubscriberResult

/**
 * Verdicts worth remembering. Everything else is rejected by a length or byte comparison in about a
 * microsecond, so caching it would save nothing while handing anybody who can send a request an easy
 * way to fill the cache with distinct keys.
 */
const CACHEABLE_REJECTIONS: ReadonlySet<Rejected> = new Set([REJECTED.FORGED, REJECTED.WRONG_HOSTNAME])

export const isCacheable = (verdict: CachedVerdict) => verdict.subscriber || CACHEABLE_REJECTIONS.has(verdict.reason)

/**
 * The whole of Phase C: expiry, authority signature, hostname binding. No network, no shared state,
 * no clock beyond the local one.
 *
 * Checks run cheapest-first, and the authority signature is verified before the hostname signature so
 * that the ephemeral key is known to be one the platform actually blessed before anything is verified
 * against it.
 */
export async function verifyToken(
  token: string,
  hostname: string,
  authorityPublicKey: Uint8Array,
  nowSeconds: number,
  clockToleranceSeconds: number
): Promise<CachedVerdict> {
  const parsed = readToken(token)

  if (parsed === "malformed") return { subscriber: false, reason: REJECTED.MALFORMED }
  if (parsed === "unsupported_version") return { subscriber: false, reason: REJECTED.UNSUPPORTED_VERSION }

  if (parsed.expiresAt + clockToleranceSeconds <= nowSeconds) {
    return { subscriber: false, reason: REJECTED.EXPIRED }
  }

  const credentialValid = await verifyEd25519(
    credentialMessage(parsed.bytes),
    authoritySignature(parsed.bytes),
    authorityPublicKey
  )

  if (!credentialValid) return { subscriber: false, reason: REJECTED.FORGED }

  const boundToThisHost = await verifyEd25519(
    hostnameMessage(parsed.bytes, hostname),
    hostnameSignature(parsed.bytes),
    ephemeralPublicKey(parsed.bytes)
  )

  if (!boundToThisHost) return { subscriber: false, reason: REJECTED.WRONG_HOSTNAME }

  return { subscriber: true, plan: parsed.plan, expiresAt: parsed.expiresAt }
}

/** Expands a stored verdict into the result handed back to the caller. */
export function toResult(verdict: CachedVerdict, hostname: string, cached: boolean): VerificationResult {
  if (!verdict.subscriber) return { subscriber: false, reason: verdict.reason, hostname, cached }

  return {
    subscriber: true,
    plan: verdict.plan,
    planName: PLAN_NAME[verdict.plan],
    expiresAt: new Date(verdict.expiresAt * 1000),
    hostname,
    cached,
  }
}
