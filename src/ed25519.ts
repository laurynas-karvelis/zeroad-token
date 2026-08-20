/**
 * Ed25519 verification across Node, Bun, Deno and edge runtimes.
 *
 * `node:crypto`'s synchronous `verify` is the fastest path by a wide margin (36.7us against 46.0us for
 * the same call dispatched to the libuv threadpool, and 47.3us for WebCrypto, measured on Bun 1.3).
 * Work that takes 37us does not need to leave the main thread - handing it to a threadpool costs more
 * than the work itself - so the synchronous primitive is preferred, with WebCrypto as the fallback for
 * runtimes without `node:crypto`, such as Cloudflare Workers.
 */

/** SPKI DER prefix for an Ed25519 public key. Prepended to a raw 32-byte key to import it. */
const SPKI_PREFIX = new Uint8Array([0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00])

export const RAW_PUBLIC_KEY_BYTES = 32
export const SIGNATURE_BYTES = 64

export type Verifier = (
  message: Uint8Array,
  signature: Uint8Array,
  rawPublicKey: Uint8Array
) => boolean | Promise<boolean>

function toSpki(rawPublicKey: Uint8Array): Uint8Array {
  const spki = new Uint8Array(SPKI_PREFIX.length + rawPublicKey.length)
  spki.set(SPKI_PREFIX, 0)
  spki.set(rawPublicKey, SPKI_PREFIX.length)
  return spki
}

function decodeStandardBase64(base64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    const buffer = Buffer.from(base64, "base64")
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  }

  if (typeof atob !== "function") throw new Error("No base64 decoder available in this runtime")

  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

/** Strips the SPKI DER wrapper off a base64 public key, leaving the raw 32 bytes. */
export function rawPublicKeyFromSpkiBase64(base64: string): Uint8Array {
  const invalid = new Error("Expected a base64-encoded SPKI DER Ed25519 public key")
  const bytes = decodeStandardBase64(base64)

  if (bytes.length !== SPKI_PREFIX.length + RAW_PUBLIC_KEY_BYTES) throw invalid

  for (let index = 0; index < SPKI_PREFIX.length; index++) {
    if (bytes[index] !== SPKI_PREFIX[index]) throw invalid
  }

  return bytes.subarray(SPKI_PREFIX.length)
}

async function selectVerifier(): Promise<Verifier> {
  return (await nodeCryptoVerifier()) ?? webCryptoVerifier() ?? missing()
}

function missing(): never {
  throw new Error("No Ed25519 implementation available in this runtime")
}

/**
 * The fast path. Returns `undefined` when `node:crypto` is absent, and also when it resolves to a stub
 * that does not actually implement these functions - which some edge runtimes and bundler shims
 * provide. Checking that they are callable matters: destructuring a stub yields `undefined` without
 * throwing, and a verifier built on that would fail every signature instead of falling back, quietly
 * turning away every genuine subscriber.
 */
export async function nodeCryptoVerifier(): Promise<Verifier | undefined> {
  try {
    return verifierFromNodeCrypto(await import("node:crypto"))
  } catch {
    return undefined
  }
}

/** Split out from the import so the stub case can be tested without mocking a built-in module. */
export function verifierFromNodeCrypto(nodeCrypto: Partial<typeof import("node:crypto")>): Verifier | undefined {
  const { createPublicKey, verify } = nodeCrypto

  if (typeof createPublicKey !== "function" || typeof verify !== "function") return undefined

  return (message, signature, rawPublicKey) => {
    // The 0.5us key import is paid per verification rather than cached: an ephemeral key is used by
    // exactly one site for one day, so a key cache would only ever hold single-use entries, and the
    // result cache above this layer already short-circuits every repeat of the same token
    const key = createPublicKey({
      key: Buffer.from(toSpki(rawPublicKey)),
      format: "der",
      type: "spki",
    })
    return verify(null, message, key, signature)
  }
}

/** The fallback, for edge runtimes. Slower per call, but universally available. */
export function webCryptoVerifier(): Verifier | undefined {
  if (typeof crypto === "undefined" || !crypto.subtle) return undefined

  return async (message, signature, rawPublicKey) => {
    const key = await crypto.subtle.importKey("raw", rawPublicKey as BufferSource, { name: "Ed25519" }, false, [
      "verify",
    ])
    return crypto.subtle.verify({ name: "Ed25519" }, key, signature as BufferSource, message as BufferSource)
  }
}

let verifier: Verifier | undefined
let pending: Promise<Verifier> | undefined

/**
 * Verifies an Ed25519 signature. Returns `false` on any failure, including a malformed key or
 * signature - callers treat every negative the same way, and throwing would only be noise.
 */
export async function verifyEd25519(
  message: Uint8Array,
  signature: Uint8Array,
  rawPublicKey: Uint8Array
): Promise<boolean> {
  if (!verifier) {
    // Concurrent first calls share one resolution instead of racing to import
    pending ??= selectVerifier()
    verifier = await pending
  }

  try {
    return await verifier(message, signature, rawPublicKey)
  } catch {
    return false
  }
}

/**
 * Test seam. With no argument, forces the runtime primitive to be re-selected on the next call;
 * with one, pins the primitive so the fallback path can be exercised on a runtime that would
 * otherwise always choose `node:crypto`.
 */
export function useVerifier(override?: Verifier): void {
  verifier = override
  pending = override ? Promise.resolve(override) : undefined
}
