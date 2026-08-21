import { fromBase64Url } from "./base64";
import { PLAN, PROTOCOL_VERSION } from "./constants";
import { RAW_PUBLIC_KEY_BYTES, SIGNATURE_BYTES } from "./ed25519";
/**
 * Token wire format, version 1 - 174 bytes, 232 base64url characters.
 *
 * ```
 *   offset  size  field
 *        0     1  version
 *        1     1  plan
 *        2     4  expiresAt, u32 unix seconds, little-endian
 *        6    32  ephemeralPublicKey
 *       38    64  authoritySignature
 *      102     8  nonce
 *      110    64  hostnameSignature
 * ```
 *
 * Two signatures, because the authority signs long before anyone knows which site the visitor will
 * open. The authority signs a batch credential over `version | plan | expiresAt | ephemeralPublicKey`;
 * the extension holds the matching ephemeral private key and, on first contact with a site, signs that
 * site's hostname with it. A publisher receiving the token holds only a public key and a signature over
 * its own hostname, so it cannot mint a binding for anybody else's site - which is what stops one
 * publisher replaying a visitor's token at another.
 *
 * The hostname is deliberately absent from the wire. The verifier already knows which host it serves
 * and reconstructs the signed message from that, so there is nothing to compare, parse or spoof: a
 * token bound elsewhere simply fails the signature check.
 */
export const VERSION_OFFSET = 0;
export const PLAN_OFFSET = 1;
export const EXPIRES_AT_OFFSET = 2;
export const EPHEMERAL_PUBLIC_KEY_OFFSET = 6;
export const AUTHORITY_SIGNATURE_OFFSET = EPHEMERAL_PUBLIC_KEY_OFFSET + RAW_PUBLIC_KEY_BYTES;
export const NONCE_OFFSET = AUTHORITY_SIGNATURE_OFFSET + SIGNATURE_BYTES;
export const NONCE_BYTES = 8;
export const HOSTNAME_SIGNATURE_OFFSET = NONCE_OFFSET + NONCE_BYTES;
export const TOKEN_BYTES = HOSTNAME_SIGNATURE_OFFSET + SIGNATURE_BYTES;
/** Exact base64url length of a `TOKEN_BYTES` payload, unpadded. */
export const TOKEN_CHARACTERS = Math.ceil((TOKEN_BYTES * 4) / 3);
/**
 * Domain separation tags. Without them a signature made for one purpose could be presented as if it
 * had been made for the other, and a future protocol could be tricked into accepting a v1 signature.
 */
const CREDENTIAL_DOMAIN = "better-web:credential:v1";
const HOSTNAME_DOMAIN = "better-web:hostname:v1";
const textEncoder = new TextEncoder();
const CREDENTIAL_DOMAIN_BYTES = textEncoder.encode(CREDENTIAL_DOMAIN);
const HOSTNAME_DOMAIN_BYTES = textEncoder.encode(HOSTNAME_DOMAIN);
const KNOWN_PLANS = new Set(Object.values(PLAN));
/**
 * Parses the fixed-width fields and rejects anything that cannot possibly verify, before spending
 * ~74us of elliptic curve maths on it. Everything here is a length check or a byte comparison.
 */
export function readToken(token) {
    // Cheapest possible filter, and the one that stops an attacker filling memory with junk: a token is
    // always exactly this long, so oversized input is discarded before it is decoded or cached
    if (token.length !== TOKEN_CHARACTERS)
        return "malformed";
    const bytes = fromBase64Url(token);
    if (!bytes || bytes.length !== TOKEN_BYTES)
        return "malformed";
    if (bytes[VERSION_OFFSET] !== PROTOCOL_VERSION)
        return "unsupported_version";
    const plan = bytes[PLAN_OFFSET];
    if (!KNOWN_PLANS.has(plan))
        return "malformed";
    // Little-endian, spelled out rather than read through a DataView, because a DataView allocation per
    // token is measurable at this call volume and the field is only four bytes
    const expiresAt = (bytes[EXPIRES_AT_OFFSET] |
        (bytes[EXPIRES_AT_OFFSET + 1] << 8) |
        (bytes[EXPIRES_AT_OFFSET + 2] << 16) |
        (bytes[EXPIRES_AT_OFFSET + 3] << 24)) >>>
        0;
    return { bytes, plan: plan, expiresAt };
}
/** The message the authority signed at issuance: the domain tag plus every field up to its signature. */
export function credentialMessage(bytes) {
    const message = new Uint8Array(CREDENTIAL_DOMAIN_BYTES.length + AUTHORITY_SIGNATURE_OFFSET);
    message.set(CREDENTIAL_DOMAIN_BYTES, 0);
    message.set(bytes.subarray(0, AUTHORITY_SIGNATURE_OFFSET), CREDENTIAL_DOMAIN_BYTES.length);
    return message;
}
/**
 * The message the extension signed with its ephemeral key when it first met this hostname: the domain
 * tag, every field up to the hostname signature, and the hostname itself.
 */
export function hostnameMessage(bytes, hostname) {
    const hostnameBytes = textEncoder.encode(hostname);
    const message = new Uint8Array(HOSTNAME_DOMAIN_BYTES.length + HOSTNAME_SIGNATURE_OFFSET + hostnameBytes.length);
    message.set(HOSTNAME_DOMAIN_BYTES, 0);
    message.set(bytes.subarray(0, HOSTNAME_SIGNATURE_OFFSET), HOSTNAME_DOMAIN_BYTES.length);
    message.set(hostnameBytes, HOSTNAME_DOMAIN_BYTES.length + HOSTNAME_SIGNATURE_OFFSET);
    return message;
}
export const ephemeralPublicKey = (bytes) => bytes.subarray(EPHEMERAL_PUBLIC_KEY_OFFSET, EPHEMERAL_PUBLIC_KEY_OFFSET + RAW_PUBLIC_KEY_BYTES);
export const authoritySignature = (bytes) => bytes.subarray(AUTHORITY_SIGNATURE_OFFSET, AUTHORITY_SIGNATURE_OFFSET + SIGNATURE_BYTES);
export const hostnameSignature = (bytes) => bytes.subarray(HOSTNAME_SIGNATURE_OFFSET, HOSTNAME_SIGNATURE_OFFSET + SIGNATURE_BYTES);
