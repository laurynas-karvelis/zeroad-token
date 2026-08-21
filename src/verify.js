import { PLAN_NAME } from "./constants";
import { verifyEd25519 } from "./ed25519";
import { REJECTED } from "./rejection";
import { authoritySignature, credentialMessage, ephemeralPublicKey, hostnameMessage, hostnameSignature, readToken, } from "./token";
/**
 * Verdicts worth remembering. Everything else is rejected by a length or byte comparison in about a
 * microsecond, so caching it would save nothing while handing anybody who can send a request an easy
 * way to fill the cache with distinct keys.
 */
const CACHEABLE_REJECTIONS = new Set([REJECTED.FORGED, REJECTED.WRONG_HOSTNAME]);
export const isCacheable = (verdict) => verdict.subscriber || CACHEABLE_REJECTIONS.has(verdict.reason);
/**
 * The whole of Phase C: expiry, authority signature, hostname binding. No network, no shared state,
 * no clock beyond the local one.
 *
 * Checks run cheapest-first, and the authority signature is verified before the hostname signature so
 * that the ephemeral key is known to be one the platform actually blessed before anything is verified
 * against it.
 */
export async function verifyToken(token, hostname, authorityPublicKey, nowSeconds, clockToleranceSeconds) {
    const parsed = readToken(token);
    if (parsed === "malformed")
        return { subscriber: false, reason: REJECTED.MALFORMED };
    if (parsed === "unsupported_version")
        return { subscriber: false, reason: REJECTED.UNSUPPORTED_VERSION };
    if (parsed.expiresAt + clockToleranceSeconds <= nowSeconds) {
        return { subscriber: false, reason: REJECTED.EXPIRED };
    }
    const credentialValid = await verifyEd25519(credentialMessage(parsed.bytes), authoritySignature(parsed.bytes), authorityPublicKey);
    if (!credentialValid)
        return { subscriber: false, reason: REJECTED.FORGED };
    const boundToThisHost = await verifyEd25519(hostnameMessage(parsed.bytes, hostname), hostnameSignature(parsed.bytes), ephemeralPublicKey(parsed.bytes));
    if (!boundToThisHost)
        return { subscriber: false, reason: REJECTED.WRONG_HOSTNAME };
    return { subscriber: true, plan: parsed.plan, expiresAt: parsed.expiresAt };
}
/** Expands a stored verdict into the result handed back to the caller. */
export function toResult(verdict, hostname, cached) {
    if (!verdict.subscriber)
        return { subscriber: false, reason: verdict.reason, hostname, cached };
    return {
        subscriber: true,
        plan: verdict.plan,
        planName: PLAN_NAME[verdict.plan],
        expiresAt: new Date(verdict.expiresAt * 1000),
        hostname,
        cached,
    };
}
