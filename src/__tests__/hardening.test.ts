import { generateKeyPairSync, randomBytes, sign } from "node:crypto"
import { afterEach, describe, expect, test } from "bun:test"
import { nodeCryptoVerifier, useVerifier, verifierFromNodeCrypto, verifyEd25519, webCryptoVerifier } from "../ed25519"
import { createPublisher, type Publisher } from "../publisher"
import { REJECTED } from "../rejection"
import {
  AUTHORITY_SIGNATURE_OFFSET,
  HOSTNAME_SIGNATURE_OFFSET,
  NONCE_OFFSET,
  readToken,
  TOKEN_BYTES,
  TOKEN_CHARACTERS,
} from "../token"
import { type Authority, bindToHostname, createAuthority, issueCredential, mintToken } from "./__fixtures__/authority"

const HOSTNAME = "example.com"

function build(authority: Authority, overrides: Partial<Parameters<typeof createPublisher>[0]> = {}): Publisher {
  return createPublisher({
    publisherId: "pub_hardening",
    hostnames: HOSTNAME,
    publicKey: authority.publicKey,
    ...overrides,
  })
}

const decode = (token: string) => new Uint8Array(Buffer.from(token, "base64url"))
const encode = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url")

/**
 * Everything here is aimed at the same question: can anything other than a token the platform issued,
 * for this host, still in date, come back `subscriber: true`?
 */

describe("the runtime fallback actually works", () => {
  afterEach(() => {
    useVerifier()
  })

  test("both primitives agree on a genuine signature", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519")
    const der = publicKey.export({ format: "der", type: "spki" })
    const raw = new Uint8Array(der.subarray(der.length - 32))
    const message = randomBytes(110)
    const signature = new Uint8Array(sign(null, message, privateKey))

    const node = await nodeCryptoVerifier()
    const web = webCryptoVerifier()

    expect(node).toBeDefined()
    expect(web).toBeDefined()

    expect(await node?.(message, signature, raw)).toBe(true)
    expect(await web?.(message, signature, raw)).toBe(true)

    // And both reject the same forgery
    const tampered = new Uint8Array(signature)
    tampered[0] ^= 0x01
    expect(await node?.(message, tampered, raw)).toBe(false)
    expect(await web?.(message, tampered, raw)).toBe(false)
  })

  test("a full token verifies through WebCrypto, the path edge runtimes take", async () => {
    const web = webCryptoVerifier()
    if (!web) throw new Error("WebCrypto Ed25519 unavailable in this runtime")

    useVerifier(web)

    const authority = createAuthority()
    const publisher = build(authority, { cache: false })

    expect((await publisher.verify(mintToken(authority, HOSTNAME))).subscriber).toBe(true)
    expect(await publisher.verify(mintToken(authority, "elsewhere.example"))).toMatchObject({
      reason: REJECTED.WRONG_HOSTNAME,
    })
    expect(await publisher.verify(mintToken(createAuthority(), HOSTNAME))).toMatchObject({
      reason: REJECTED.FORGED,
    })
  })

  test.each([
    ["an empty module", {}],
    ["only createPublicKey", { createPublicKey: (() => {}) as never }],
    ["only verify", { verify: (() => {}) as never }],
    ["non-callable properties", { createPublicKey: {} as never, verify: {} as never }],
  ])("a node:crypto stub exposing %s is refused, so the fallback is reached", (_label, stub) => {
    // Some edge runtimes and bundler shims resolve `node:crypto` to an object with nothing usable on
    // it. Destructuring that yields undefined without throwing, so the guard has to be an explicit
    // callable check - a verifier built on a stub would fail every signature instead of falling back,
    // quietly turning away every genuine subscriber
    expect(verifierFromNodeCrypto(stub)).toBeUndefined()
  })

  test("a real node:crypto module is accepted", async () => {
    expect(verifierFromNodeCrypto(await import("node:crypto"))).toBeDefined()
  })
})

describe("no substitution of one signature for the other", () => {
  test("the hostname signature cannot stand in for the authority signature", async () => {
    const authority = createAuthority()
    const publisher = build(authority)
    const bytes = decode(mintToken(authority, HOSTNAME))

    // Copy the hostname signature over the authority signature. Both are real Ed25519 signatures made
    // by a key in this token - only the domain tags and the signing key keep them apart
    bytes.copyWithin(AUTHORITY_SIGNATURE_OFFSET, HOSTNAME_SIGNATURE_OFFSET, TOKEN_BYTES)

    expect(await publisher.verify(encode(bytes))).toMatchObject({ reason: REJECTED.FORGED })
  })

  test("the authority signature cannot stand in for the hostname signature", async () => {
    const authority = createAuthority()
    const publisher = build(authority)
    const bytes = decode(mintToken(authority, HOSTNAME))

    bytes.copyWithin(HOSTNAME_SIGNATURE_OFFSET, AUTHORITY_SIGNATURE_OFFSET, NONCE_OFFSET)

    expect(await publisher.verify(encode(bytes))).toMatchObject({ reason: REJECTED.WRONG_HOSTNAME })
  })

  test("a credential cannot be paired with another credential's hostname signature", async () => {
    const authority = createAuthority()
    const publisher = build(authority)

    // Two genuine tokens for this host, from two genuine credentials. Splicing one's binding onto the
    // other must fail: the hostname signature covers the whole credential, ephemeral key included
    const first = decode(mintToken(authority, HOSTNAME))
    const second = decode(mintToken(authority, HOSTNAME))

    first.set(second.subarray(HOSTNAME_SIGNATURE_OFFSET), HOSTNAME_SIGNATURE_OFFSET)

    expect(await publisher.verify(encode(first))).toMatchObject({ reason: REJECTED.WRONG_HOSTNAME })
  })

  test("swapping in another credential's ephemeral key breaks the authority signature", async () => {
    const authority = createAuthority()
    const publisher = build(authority)

    const target = decode(mintToken(authority, HOSTNAME))
    const donor = decode(mintToken(authority, HOSTNAME))

    // Take the donor's ephemeral public key, which the authority genuinely signed - just not here
    target.set(donor.subarray(6, 38), 6)

    expect(await publisher.verify(encode(target))).toMatchObject({ reason: REJECTED.FORGED })
  })
})

describe("degenerate cryptographic material", () => {
  test("an all-zero ephemeral key does not verify anything", async () => {
    const authority = createAuthority()
    const publisher = build(authority)
    const bytes = decode(mintToken(authority, HOSTNAME))

    bytes.fill(0, 6, 38)

    expect((await publisher.verify(encode(bytes))).subscriber).toBe(false)
  })

  test.each([
    ["authority", AUTHORITY_SIGNATURE_OFFSET, NONCE_OFFSET],
    ["hostname", HOSTNAME_SIGNATURE_OFFSET, TOKEN_BYTES],
  ])("an all-zero %s signature does not verify", async (_label, from, to) => {
    const authority = createAuthority()
    const publisher = build(authority)
    const bytes = decode(mintToken(authority, HOSTNAME))

    bytes.fill(0, from, to)

    expect((await publisher.verify(encode(bytes))).subscriber).toBe(false)
  })

  test("an all-zero public key never validates a signature", async () => {
    expect(await verifyEd25519(new Uint8Array(32), new Uint8Array(64), new Uint8Array(32))).toBe(false)
  })
})

describe("fuzzing", () => {
  test("no random input ever produces a subscriber, and verify never throws", async () => {
    const publisher = build(createAuthority())

    for (let attempt = 0; attempt < 2000; attempt++) {
      const bytes = randomBytes(TOKEN_BYTES)

      // Give the fuzzer a fighting chance: force a valid version, a known plan and a future expiry, so
      // it spends its attempts on the signatures rather than dying at the layout check
      bytes[0] = 1
      bytes[1] = 1
      bytes.writeUInt32LE(0x70000000, 2)

      const result = await publisher.verify(encode(new Uint8Array(bytes)))
      expect(result.subscriber).toBe(false)
    }
  })

  test("arbitrary strings are rejected without throwing", async () => {
    const publisher = build(createAuthority())

    const inputs = [
      "",
      " ",
      " ",
      "null",
      "%s%s%s",
      "../../etc/passwd",
      "a".repeat(TOKEN_CHARACTERS),
      "=".repeat(TOKEN_CHARACTERS),
      "é".repeat(TOKEN_CHARACTERS),
      "😀".repeat(TOKEN_CHARACTERS),
      Buffer.alloc(TOKEN_BYTES).toString("base64"),
      Buffer.alloc(TOKEN_BYTES).toString("hex"),
      "z".repeat(1_000_000),
    ]

    for (const input of inputs) {
      const result = await publisher.verify(input)
      expect(result.subscriber).toBe(false)
    }
  })

  test("random bytes never parse as a well-formed token", () => {
    let parsed = 0

    for (let attempt = 0; attempt < 5000; attempt++) {
      if (typeof readToken(encode(new Uint8Array(randomBytes(TOKEN_BYTES)))) !== "string") parsed++
    }

    // Only version 1 with a known plan byte gets through, which is 1 in 65536 of random inputs
    expect(parsed).toBeLessThan(5)
  })
})

describe("oversized headers stay cheap", () => {
  test("a huge header costs no more to reject than a normal one", async () => {
    // A token is always exactly `TOKEN_CHARACTERS` long, and rejecting on that before decoding is what
    // keeps a flood of large headers from turning into a flood of large allocations. Measured against
    // a same-size baseline rather than a wall-clock budget, so the ratio holds on any machine: with
    // the length gate the two are within a factor of one, without it the huge one is ~145x worse
    const publisher = build(createAuthority())

    const huge = "z".repeat(1_000_000)
    const ordinary = "z".repeat(TOKEN_CHARACTERS)

    const time = async (input: string) => {
      for (let warmup = 0; warmup < 20; warmup++) await publisher.verify(input)

      const started = performance.now()
      for (let attempt = 0; attempt < 500; attempt++) await publisher.verify(input)
      return performance.now() - started
    }

    const ordinaryCost = await time(ordinary)
    const hugeCost = await time(huge)

    expect((await publisher.verify(huge)).subscriber).toBe(false)
    expect(hugeCost).toBeLessThan(Math.max(ordinaryCost, 1) * 10)
  })
})

describe("hostnames that look alike", () => {
  test("a unicode hostname and its punycode form are different hosts", async () => {
    const authority = createAuthority()
    const publisher = createPublisher({
      publisherId: "pub_idn",
      hostnames: ["xn--mnchen-3ya.de", "ünchen.de"],
      publicKey: authority.publicKey,
    })

    const punycode = mintToken(authority, "xn--mnchen-3ya.de")

    expect((await publisher.verify(punycode, "xn--mnchen-3ya.de")).subscriber).toBe(true)
    expect(await publisher.verify(punycode, "ünchen.de")).toMatchObject({
      reason: REJECTED.WRONG_HOSTNAME,
    })
  })

  test("a subdomain cannot spend the apex domain's token", async () => {
    const authority = createAuthority()
    const publisher = createPublisher({
      publisherId: "pub_sub",
      hostnames: ["example.com", "shop.example.com"],
      publicKey: authority.publicKey,
    })

    const apex = mintToken(authority, "example.com")

    expect((await publisher.verify(apex, "example.com")).subscriber).toBe(true)
    expect(await publisher.verify(apex, "shop.example.com")).toMatchObject({
      reason: REJECTED.WRONG_HOSTNAME,
    })
  })

  test("a trailing-dot host and its plain form are the same host", async () => {
    const authority = createAuthority()
    const publisher = build(authority)

    // Both sides canonicalise, so the extension binding "example.com" is honoured for "example.com."
    expect((await publisher.verify(mintToken(authority, HOSTNAME), "example.com.")).subscriber).toBe(true)
  })
})

describe("concurrency and cache integrity", () => {
  test("simultaneous first verifications of one token all agree", async () => {
    const authority = createAuthority()
    const publisher = build(authority)
    const token = mintToken(authority, HOSTNAME)

    const results = await Promise.all(Array.from({ length: 64 }, () => publisher.verify(token)))

    expect(results.every((result) => result.subscriber)).toBe(true)
    expect(publisher.cacheStats().size).toBe(1)
  })

  test("a rejected token cannot displace an accepted one under the same key", async () => {
    const authority = createAuthority()
    const publisher = build(authority)

    const good = mintToken(authority, HOSTNAME)
    await publisher.verify(good)

    // A different token, same host - it gets its own entry and leaves the good verdict alone
    await publisher.verify(mintToken(createAuthority(), HOSTNAME))

    expect(await publisher.verify(good)).toMatchObject({ subscriber: true, cached: true })
  })

  test("two publishers in one process do not share a cache", async () => {
    const authority = createAuthority()
    const token = mintToken(authority, HOSTNAME)

    const first = build(authority)
    const second = build(authority)

    await first.verify(token)

    expect((await second.verify(token)).cached).toBe(false)
    expect(second.cacheStats().size).toBe(1)
    expect(first.cacheStats().size).toBe(1)
  })

  test("one publisher's public key override cannot leak into another", async () => {
    const real = createAuthority()
    const impostor = createAuthority()
    const token = mintToken(impostor, HOSTNAME)

    const strict = build(real)
    const permissive = build(impostor)

    // Same token, same hostname, different trusted key - the verdicts must not cross over
    expect((await permissive.verify(token)).subscriber).toBe(true)
    expect(await strict.verify(token)).toMatchObject({ reason: REJECTED.FORGED })
  })
})

describe("expiry boundaries", () => {
  test("a token expiring this very second is still honoured, one second later it is not", async () => {
    const authority = createAuthority()
    const publisher = build(authority, { clockToleranceSeconds: 0, cache: false })
    const now = Math.floor(Date.now() / 1000)

    expect((await publisher.verify(mintToken(authority, HOSTNAME, { expiresAt: now + 1 }))).subscriber).toBe(true)
    expect(await publisher.verify(mintToken(authority, HOSTNAME, { expiresAt: now }))).toMatchObject({
      reason: REJECTED.EXPIRED,
    })
  })

  test("a token expiring inside the cache TTL is not served stale from the cache", async () => {
    const authority = createAuthority()
    const publisher = build(authority, { clockToleranceSeconds: 0, cache: { ttl: 600_000 } })

    // Expires in one second, but the cache would happily hold a verdict for ten minutes
    const token = mintToken(authority, HOSTNAME, { expiresAt: Math.floor(Date.now() / 1000) + 1 })

    expect((await publisher.verify(token)).subscriber).toBe(true)

    await new Promise((resolve) => setTimeout(resolve, 1100))

    const afterExpiry = await publisher.verify(token)
    expect(afterExpiry).toMatchObject({ subscriber: false, reason: REJECTED.EXPIRED })
  })

  test("the far end of the u32 expiry range is accepted", async () => {
    const authority = createAuthority()
    const publisher = build(authority)

    // 2106-02-07, the last second the wire format can express
    expect((await publisher.verify(mintToken(authority, HOSTNAME, { expiresAt: 0xffffffff }))).subscriber).toBe(true)
  })
})

describe("one credential, many sites", () => {
  test("the format does not stop a credential being bound to two hosts, and each stands alone", async () => {
    // The extension is expected to use a fresh keypair per site, which is what keeps sites from
    // correlating visitors. Nothing in the format enforces that, so this pins down what a publisher
    // sees if it ever stops: each binding still verifies only at its own host
    const authority = createAuthority()
    const credential = issueCredential(authority)

    const forA = bindToHostname(credential, "a.example")
    const forB = bindToHostname(credential, "b.example")

    const siteA = createPublisher({ publisherId: "pub_a", hostnames: "a.example", publicKey: authority.publicKey })
    const siteB = createPublisher({ publisherId: "pub_b", hostnames: "b.example", publicKey: authority.publicKey })

    expect((await siteA.verify(forA)).subscriber).toBe(true)
    expect((await siteB.verify(forB)).subscriber).toBe(true)

    expect(await siteA.verify(forB)).toMatchObject({ reason: REJECTED.WRONG_HOSTNAME })
    expect(await siteB.verify(forA)).toMatchObject({ reason: REJECTED.WRONG_HOSTNAME })
  })

  test("the nonce does not affect the verdict, but is covered by the signature", async () => {
    const authority = createAuthority()
    const publisher = build(authority)
    const credential = issueCredential(authority)

    const first = bindToHostname(credential, HOSTNAME, { nonce: new Uint8Array([1, 1, 1, 1, 1, 1, 1, 1]) })
    const second = bindToHostname(credential, HOSTNAME, { nonce: new Uint8Array([2, 2, 2, 2, 2, 2, 2, 2]) })

    expect(first).not.toBe(second)
    expect((await publisher.verify(first)).subscriber).toBe(true)
    expect((await publisher.verify(second)).subscriber).toBe(true)

    // Editing the nonce afterwards invalidates the binding it was signed into
    const edited = decode(first)
    edited[NONCE_OFFSET] ^= 0xff

    expect(await publisher.verify(encode(edited))).toMatchObject({ reason: REJECTED.WRONG_HOSTNAME })
  })
})
