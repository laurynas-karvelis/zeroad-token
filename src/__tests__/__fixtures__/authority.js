import { generateKeyPairSync, sign } from "node:crypto";
import { PLAN, PROTOCOL_VERSION } from "../../constants";
/**
 * Reference implementation of the two parties this SDK does not contain: the authority that issues
 * batch credentials, and the extension that binds one to a hostname.
 *
 * It exists to drive the tests, but it is also the clearest statement of the wire format anywhere in
 * the repository - the Go, PHP and Rust ports should be checked against it.
 */
const CREDENTIAL_DOMAIN = "better-web:credential:v1";
const HOSTNAME_DOMAIN = "better-web:hostname:v1";
const AUTHORITY_SIGNATURE_OFFSET = 38;
const NONCE_OFFSET = 102;
const HOSTNAME_SIGNATURE_OFFSET = 110;
const TOKEN_BYTES = 174;
const encoder = new TextEncoder();
function concat(...parts) {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
        result.set(part, offset);
        offset += part.length;
    }
    return result;
}
function toBase64Url(bytes) {
    return Buffer.from(bytes).toString("base64url");
}
function rawPublicKey(key) {
    const der = key.export({ format: "der", type: "spki" });
    return new Uint8Array(der.subarray(der.length - 32));
}
export function createAuthority() {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    return {
        publicKey: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
        privateKey,
    };
}
/**
 * Phase A: over an authenticated session, the authority checks the subscription is live and signs the
 * extension's freshly generated ephemeral public key. It never sees the private half.
 */
export function issueCredential(authority, options = {}) {
    const plan = options.plan ?? PLAN.FREEDOM;
    const version = options.version ?? PROTOCOL_VERSION;
    const expiresAt = options.expiresAt ?? Math.floor(Date.now() / 1000) + 3600;
    const ephemeral = generateKeyPairSync("ed25519");
    const signed = new Uint8Array(AUTHORITY_SIGNATURE_OFFSET);
    signed[0] = version;
    signed[1] = plan;
    signed[2] = expiresAt & 0xff;
    signed[3] = (expiresAt >>> 8) & 0xff;
    signed[4] = (expiresAt >>> 16) & 0xff;
    signed[5] = (expiresAt >>> 24) & 0xff;
    signed.set(rawPublicKey(ephemeral.publicKey), 6);
    const signature = sign(null, concat(encoder.encode(CREDENTIAL_DOMAIN), signed), authority.privateKey);
    return {
        prefix: concat(signed, new Uint8Array(signature)),
        ephemeralPrivateKey: ephemeral.privateKey,
    };
}
/**
 * Phase B: entirely local and offline. The extension picks an unused credential, stamps the hostname
 * it is about to contact, and signs that with the ephemeral key.
 */
export function bindToHostname(credential, hostname, options = {}) {
    const nonce = options.nonce ?? new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    if (nonce.length !== 8)
        throw new Error("Nonce must be 8 bytes");
    const token = new Uint8Array(TOKEN_BYTES);
    token.set(credential.prefix, 0);
    token.set(nonce, NONCE_OFFSET);
    const message = concat(encoder.encode(HOSTNAME_DOMAIN), token.subarray(0, HOSTNAME_SIGNATURE_OFFSET), encoder.encode(hostname));
    const signature = sign(null, message, options.signingKey ?? credential.ephemeralPrivateKey);
    token.set(new Uint8Array(signature), HOSTNAME_SIGNATURE_OFFSET);
    return toBase64Url(token);
}
/** Convenience for the common case: issue a credential and bind it in one step. */
export function mintToken(authority, hostname, options = {}) {
    return bindToHostname(issueCredential(authority, options), hostname, options);
}
/** Flips one bit at `offset`, for tampering tests. */
export function corruptAt(token, offset) {
    const bytes = new Uint8Array(Buffer.from(token, "base64url"));
    bytes[offset] ^= 0x01;
    return toBase64Url(bytes);
}
