import { generateKeyPairSync, sign } from "node:crypto"
import { describe, expect, test } from "bun:test"
import { fromBase64Url } from "../base64"
import { AUTHORITY_PUBLIC_KEY } from "../constants"
import { RAW_PUBLIC_KEY_BYTES, rawPublicKeyFromSpkiBase64, useVerifier, verifyEd25519 } from "../ed25519"
import { TOKEN_BYTES, TOKEN_CHARACTERS } from "../token"

const keyPair = generateKeyPairSync("ed25519")
const rawKey = rawPublicKeyFromSpkiBase64(keyPair.publicKey.export({ format: "der", type: "spki" }).toString("base64"))
const message = new TextEncoder().encode("better-web")
const signature = new Uint8Array(sign(null, message, keyPair.privateKey))

describe("rawPublicKeyFromSpkiBase64", () => {
  test("unwraps the platform key to 32 raw bytes", () => {
    expect(rawPublicKeyFromSpkiBase64(AUTHORITY_PUBLIC_KEY)).toHaveLength(RAW_PUBLIC_KEY_BYTES)
  })

  test.each([
    ["an empty string", ""],
    ["a raw 32-byte key with no SPKI wrapper", Buffer.alloc(32).toString("base64")],
    ["the right length but the wrong prefix", Buffer.alloc(44).toString("base64")],
    ["an RSA key", Buffer.alloc(294).toString("base64")],
  ])("refuses %s", (_label, base64) => {
    expect(() => rawPublicKeyFromSpkiBase64(base64)).toThrow(/SPKI DER Ed25519/)
  })
})

describe("verifyEd25519", () => {
  test("accepts a genuine signature", async () => {
    expect(await verifyEd25519(message, signature, rawKey)).toBe(true)
  })

  test("rejects a signature over different data", async () => {
    expect(await verifyEd25519(new TextEncoder().encode("better-web!"), signature, rawKey)).toBe(false)
  })

  test("rejects a signature from another key", async () => {
    const other = generateKeyPairSync("ed25519")
    const otherSignature = new Uint8Array(sign(null, message, other.privateKey))

    expect(await verifyEd25519(message, otherSignature, rawKey)).toBe(false)
  })

  test.each([
    ["a truncated signature", () => signature.subarray(0, 32)],
    ["an empty signature", () => new Uint8Array(0)],
    ["an over-long signature", () => new Uint8Array(65)],
  ])("returns false rather than throwing for %s", async (_label, make) => {
    expect(await verifyEd25519(message, make(), rawKey)).toBe(false)
  })

  test.each([
    ["a truncated key", () => rawKey.subarray(0, 16)],
    ["an all-zero key", () => new Uint8Array(32)],
  ])("returns false rather than throwing for %s", async (_label, make) => {
    expect(await verifyEd25519(message, signature, make())).toBe(false)
  })

  test("resolves the runtime primitive once, even under concurrent first calls", async () => {
    useVerifier()

    const results = await Promise.all(Array.from({ length: 32 }, () => verifyEd25519(message, signature, rawKey)))

    expect(results.every(Boolean)).toBe(true)
  })
})

describe("fromBase64Url", () => {
  test("decodes what the fixture encodes", () => {
    const bytes = new Uint8Array(TOKEN_BYTES).fill(7)
    const decoded = fromBase64Url(Buffer.from(bytes).toString("base64url"))

    expect(decoded).toEqual(bytes)
  })

  test("handles the base64url alphabet, which standard base64 would mangle", () => {
    // 0xfb 0xff produce "-" and "_" in base64url where base64 gives "+" and "/"
    const bytes = new Uint8Array([0xfb, 0xff, 0xbf])
    const encoded = Buffer.from(bytes).toString("base64url")

    expect(encoded).toContain("-")
    expect(fromBase64Url(encoded)).toEqual(bytes)
  })

  test("does not silently accept junk at token length", () => {
    // Whatever the runtime's decoder does with invalid characters, the result must not be a full
    // token's worth of bytes, because that length check is what gates the expensive path
    const decoded = fromBase64Url("*".repeat(TOKEN_CHARACTERS))
    expect(decoded === undefined || decoded.length !== TOKEN_BYTES).toBe(true)
  })
})
