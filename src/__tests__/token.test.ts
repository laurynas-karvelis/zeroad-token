import { describe, expect, test } from "bun:test"
import { fromBase64Url } from "../base64"
import { PLAN } from "../constants"
import { rawPublicKeyFromSpkiBase64, verifyEd25519 } from "../ed25519"
import {
  AUTHORITY_SIGNATURE_OFFSET,
  credentialMessage,
  EPHEMERAL_PUBLIC_KEY_OFFSET,
  HOSTNAME_SIGNATURE_OFFSET,
  hostnameMessage,
  NONCE_OFFSET,
  readToken,
  TOKEN_BYTES,
  TOKEN_CHARACTERS,
} from "../token"
import { createAuthority, mintToken } from "./__fixtures__/authority"

describe("wire format", () => {
  test("is 174 bytes and 232 base64url characters", () => {
    expect(TOKEN_BYTES).toBe(174)
    expect(TOKEN_CHARACTERS).toBe(232)
    expect(mintToken(createAuthority(), "example.com")).toHaveLength(TOKEN_CHARACTERS)
  })

  test("lays the fields out where the other language ports expect them", () => {
    expect(EPHEMERAL_PUBLIC_KEY_OFFSET).toBe(6)
    expect(AUTHORITY_SIGNATURE_OFFSET).toBe(38)
    expect(NONCE_OFFSET).toBe(102)
    expect(HOSTNAME_SIGNATURE_OFFSET).toBe(110)
  })

  test("never carries the hostname, so there is nothing to compare or spoof", () => {
    const hostname = "unmistakable-hostname.example"
    const bytes = fromBase64Url(mintToken(createAuthority(), hostname))

    expect(bytes).toBeDefined()
    expect(Buffer.from(bytes as Uint8Array).includes(hostname)).toBe(false)
  })
})

describe("readToken", () => {
  test("reads the plan and expiry a genuine token carries", () => {
    const expiresAt = 1_800_000_000
    const parsed = readToken(mintToken(createAuthority(), "example.com", { expiresAt }))

    expect(parsed).toMatchObject({ plan: PLAN.FREEDOM, expiresAt })
  })

  test("reads the full unsigned 32-bit expiry range without wrapping", () => {
    const parsed = readToken(mintToken(createAuthority(), "example.com", { expiresAt: 0xffffffff }))

    expect(parsed).toMatchObject({ expiresAt: 0xffffffff })
  })

  test.each([
    ["an empty string", ""],
    ["one character short", "a".repeat(TOKEN_CHARACTERS - 1)],
    ["one character long", "a".repeat(TOKEN_CHARACTERS + 1)],
    ["characters outside the base64url alphabet", "*".repeat(TOKEN_CHARACTERS)],
    ["standard base64 padding", `${"a".repeat(TOKEN_CHARACTERS - 1)}=`],
  ])("rejects %s as malformed", (_label, token) => {
    expect(readToken(token)).toBe("malformed")
  })

  test("rejects an unknown plan byte rather than guessing", () => {
    expect(readToken(mintToken(createAuthority(), "example.com", { plan: 7 as never }))).toBe("malformed")
    expect(readToken(mintToken(createAuthority(), "example.com", { plan: 0 as never }))).toBe("malformed")
  })

  test("separates a future version from plain garbage", () => {
    expect(readToken(mintToken(createAuthority(), "example.com", { version: 2 }))).toBe("unsupported_version")
  })
})

describe("signed messages", () => {
  test("the authority signature covers version, plan, expiry and the ephemeral key", async () => {
    const authority = createAuthority()
    const parsed = readToken(mintToken(authority, "example.com"))
    if (typeof parsed === "string") throw new Error(parsed)

    const message = credentialMessage(parsed.bytes)
    const signature = parsed.bytes.subarray(AUTHORITY_SIGNATURE_OFFSET, NONCE_OFFSET)

    expect(await verifyEd25519(message, signature, rawPublicKeyFromSpkiBase64(authority.publicKey))).toBe(true)
    expect(Buffer.from(message).subarray(0, 24).toString()).toBe("better-web:credential:v1")
  })

  test("the hostname message changes with the hostname", () => {
    const parsed = readToken(mintToken(createAuthority(), "example.com"))
    if (typeof parsed === "string") throw new Error(parsed)

    const forA = hostnameMessage(parsed.bytes, "a.example")
    const forB = hostnameMessage(parsed.bytes, "b.example")

    expect(Buffer.from(forA).equals(Buffer.from(forB))).toBe(false)
    expect(Buffer.from(forA).subarray(0, 22).toString()).toBe("better-web:hostname:v1")
  })

  test("the two domain tags keep the signatures from being interchangeable", () => {
    const parsed = readToken(mintToken(createAuthority(), "example.com"))
    if (typeof parsed === "string") throw new Error(parsed)

    const credential = Buffer.from(credentialMessage(parsed.bytes))
    const hostname = Buffer.from(hostnameMessage(parsed.bytes, ""))

    // The tags share a "better-web:" prefix, so what matters is that they diverge before either
    // message reaches its payload - a signature made over one can never be read as the other
    expect(credential.subarray(0, 12).equals(hostname.subarray(0, 12))).toBe(false)
    expect(credential.equals(hostname)).toBe(false)
  })
})
