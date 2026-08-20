import { afterEach, beforeEach, describe, expect, setSystemTime, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { CURRENT_PROTOCOL_VERSION, FEATURE, ZEROAD_NETWORK_PUBLIC_KEY } from "../constants"
import { generateKeys, sign } from "../crypto"
import { decodeClientHeader, encodeClientHeader, parseClientToken } from "../headers/client"
import { headerCache } from "../headers/client/cache"
import { fromBase64, toBase64 } from "../helpers"

const DENIED_CONTEXT = {
  HIDE_ADVERTISEMENTS: false,
  HIDE_COOKIE_CONSENT_SCREEN: false,
  HIDE_MARKETING_DIALOGS: false,
  DISABLE_NON_FUNCTIONAL_TRACKING: false,
  DISABLE_CONTENT_PAYWALL: false,
  ENABLE_SUBSCRIPTION_ACCESS: false,
}

describe("Client Headers", () => {
  let privateKey: string
  let publicKey: string
  let clientId: string

  /** Signs arbitrary payload bytes, so tests can build tokens the encoder would refuse to produce. */
  async function signPayload(payload: Uint8Array) {
    const signature = new Uint8Array(await sign(payload.buffer as ArrayBuffer, privateKey))
    return [toBase64(payload), toBase64(signature)].join(".")
  }

  beforeEach(() => {
    const keys = generateKeys()

    privateKey = keys.privateKey
    publicKey = keys.publicKey

    clientId = randomUUID()

    // The decode cache is a module-level singleton shared by every test file in the run
    headerCache.clear()
  })

  afterEach(() => {
    setSystemTime()
  })

  describe("decodeClientHeader()", () => {
    test("should generate a valid header value", async () => {
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000)
      const features = [FEATURE.CLEAN_WEB, FEATURE.ONE_PASS]

      const headerValue = await encodeClientHeader(
        { version: CURRENT_PROTOCOL_VERSION, expiresAt, features },
        privateKey
      )

      expect(typeof headerValue).toBe("string")

      expect(await decodeClientHeader(headerValue, publicKey)).toEqual({
        expiresAt: new Date(Math.floor(expiresAt.getTime() / 1000) * 1000),
        version: CURRENT_PROTOCOL_VERSION,
        flags: 3,
      })
    })

    test("should include `clientId` when client token contains it", async () => {
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000)
      const features: FEATURE[] = []

      const headerValue = await encodeClientHeader(
        { version: CURRENT_PROTOCOL_VERSION, expiresAt, features, clientId },
        privateKey
      )

      expect(typeof headerValue).toBe("string")

      expect(await decodeClientHeader(headerValue, publicKey)).toEqual({
        expiresAt: new Date(Math.floor(expiresAt.getTime() / 1000) * 1000),
        version: CURRENT_PROTOCOL_VERSION,
        clientId,
        flags: 0,
      })
    })

    test("should generate a valid header value with expired token", async () => {
      const expiresAt = new Date(Date.now() - 24 * 3600 * 1000)
      const features = [FEATURE.CLEAN_WEB]

      const headerValue = await encodeClientHeader(
        { version: CURRENT_PROTOCOL_VERSION, expiresAt, features },
        privateKey
      )

      expect(typeof headerValue).toBe("string")

      expect(await decodeClientHeader(headerValue, publicKey)).toEqual({
        expiresAt: new Date(Math.floor(expiresAt.getTime() / 1000) * 1000),
        version: CURRENT_PROTOCOL_VERSION,
        flags: 1,
      })
    })

    test("should parse as undefined on a forged header value", async () => {
      const expiresAt = new Date(Date.now() - 24 * 3600 * 1000)
      const features = [FEATURE.CLEAN_WEB]

      const headerValue = await encodeClientHeader(
        { version: CURRENT_PROTOCOL_VERSION, expiresAt, features },
        privateKey
      )

      expect(typeof headerValue).toBe("string")
      expect(await decodeClientHeader(headerValue, ZEROAD_NETWORK_PUBLIC_KEY)).toBeUndefined()
    })
  })

  describe("parseClientToken()", () => {
    test("should construct correct output when token and site both have CLEAN_WEB feature", async () => {
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000)
      const features = [FEATURE.CLEAN_WEB]
      const headerValue = await encodeClientHeader(
        { version: CURRENT_PROTOCOL_VERSION, expiresAt, features },
        privateKey
      )

      const tokenContext = await parseClientToken(headerValue, {
        clientId,
        publicKey,
        features,
      })
      expect(tokenContext).toEqual({
        HIDE_ADVERTISEMENTS: true,
        HIDE_COOKIE_CONSENT_SCREEN: true,
        HIDE_MARKETING_DIALOGS: true,
        DISABLE_NON_FUNCTIONAL_TRACKING: true,
        DISABLE_CONTENT_PAYWALL: false,
        ENABLE_SUBSCRIPTION_ACCESS: false,
      })
    })

    test("should construct correct output when token and site both have ONE_PASS feature", async () => {
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000)
      const features = [FEATURE.ONE_PASS]
      const headerValue = await encodeClientHeader(
        { version: CURRENT_PROTOCOL_VERSION, expiresAt, features },
        privateKey
      )

      const tokenContext = await parseClientToken(headerValue, {
        clientId,
        publicKey,
        features,
      })
      expect(tokenContext).toEqual({
        HIDE_ADVERTISEMENTS: false,
        HIDE_COOKIE_CONSENT_SCREEN: false,
        HIDE_MARKETING_DIALOGS: false,
        DISABLE_NON_FUNCTIONAL_TRACKING: false,
        DISABLE_CONTENT_PAYWALL: true,
        ENABLE_SUBSCRIPTION_ACCESS: true,
      })
    })

    test("should construct correct output when token and site both have CLEAN_WEB and ONE_PASS features", async () => {
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000)
      const features = [FEATURE.CLEAN_WEB, FEATURE.ONE_PASS]
      const headerValue = await encodeClientHeader(
        { version: CURRENT_PROTOCOL_VERSION, expiresAt, features },
        privateKey
      )

      const tokenContext = await parseClientToken(headerValue, {
        clientId,
        publicKey,
        features,
      })
      expect(tokenContext).toEqual({
        HIDE_ADVERTISEMENTS: true,
        HIDE_COOKIE_CONSENT_SCREEN: true,
        HIDE_MARKETING_DIALOGS: true,
        DISABLE_NON_FUNCTIONAL_TRACKING: true,
        DISABLE_CONTENT_PAYWALL: true,
        ENABLE_SUBSCRIPTION_ACCESS: true,
      })
    })

    test("should construct correct output when token has CLEAN_WEB and site has ONE_PASS feature", async () => {
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000)
      const headerValue = await encodeClientHeader(
        {
          version: CURRENT_PROTOCOL_VERSION,
          expiresAt,
          features: [FEATURE.CLEAN_WEB],
        },
        privateKey
      )

      const tokenContext = await parseClientToken(headerValue, {
        clientId,
        publicKey,
        features: [FEATURE.ONE_PASS],
      })

      expect(tokenContext).toEqual({
        HIDE_ADVERTISEMENTS: false,
        HIDE_COOKIE_CONSENT_SCREEN: false,
        HIDE_MARKETING_DIALOGS: false,
        DISABLE_NON_FUNCTIONAL_TRACKING: false,
        DISABLE_CONTENT_PAYWALL: false,
        ENABLE_SUBSCRIPTION_ACCESS: false,
      })
    })

    test("should construct correct output when token has ONE_PASS and site has CLEAN_WEB feature", async () => {
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000)
      const headerValue = await encodeClientHeader(
        {
          version: CURRENT_PROTOCOL_VERSION,
          expiresAt,
          features: [FEATURE.ONE_PASS],
        },
        privateKey
      )

      const tokenContext = await parseClientToken(headerValue, {
        clientId,
        publicKey,
        features: [FEATURE.CLEAN_WEB],
      })

      expect(tokenContext).toEqual({
        HIDE_ADVERTISEMENTS: false,
        HIDE_COOKIE_CONSENT_SCREEN: false,
        HIDE_MARKETING_DIALOGS: false,
        DISABLE_NON_FUNCTIONAL_TRACKING: false,
        DISABLE_CONTENT_PAYWALL: false,
        ENABLE_SUBSCRIPTION_ACCESS: false,
      })
    })

    test("should construct correct output when token has both CLEAN_WEB and ONE_PASS but site has CLEAN_WEB feature only", async () => {
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000)
      const headerValue = await encodeClientHeader(
        {
          version: CURRENT_PROTOCOL_VERSION,
          expiresAt,
          features: [FEATURE.CLEAN_WEB, FEATURE.ONE_PASS],
        },
        privateKey
      )

      const tokenContext = await parseClientToken(headerValue, {
        clientId,
        publicKey,
        features: [FEATURE.CLEAN_WEB],
      })

      expect(tokenContext).toEqual({
        HIDE_ADVERTISEMENTS: true,
        HIDE_COOKIE_CONSENT_SCREEN: true,
        HIDE_MARKETING_DIALOGS: true,
        DISABLE_NON_FUNCTIONAL_TRACKING: true,
        DISABLE_CONTENT_PAYWALL: false,
        ENABLE_SUBSCRIPTION_ACCESS: false,
      })
    })

    test("should construct correct output when token has both CLEAN_WEB and ONE_PASS but site has ONE_PASS feature only", async () => {
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000)
      const headerValue = await encodeClientHeader(
        {
          version: CURRENT_PROTOCOL_VERSION,
          expiresAt,
          features: [FEATURE.CLEAN_WEB, FEATURE.ONE_PASS],
        },
        privateKey
      )

      const tokenContext = await parseClientToken(headerValue, {
        clientId,
        publicKey,
        features: [FEATURE.ONE_PASS],
      })

      expect(tokenContext).toEqual({
        HIDE_ADVERTISEMENTS: false,
        HIDE_COOKIE_CONSENT_SCREEN: false,
        HIDE_MARKETING_DIALOGS: false,
        DISABLE_NON_FUNCTIONAL_TRACKING: false,
        DISABLE_CONTENT_PAYWALL: true,
        ENABLE_SUBSCRIPTION_ACCESS: true,
      })
    })

    test("should construct correct output when token has no features while site supports all features", async () => {
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000)
      const features: FEATURE[] = []
      const headerValue = await encodeClientHeader(
        { version: CURRENT_PROTOCOL_VERSION, expiresAt, features },
        privateKey
      )

      const tokenContext = await parseClientToken(headerValue, {
        clientId,
        publicKey,
        features: [FEATURE.CLEAN_WEB, FEATURE.ONE_PASS],
      })
      expect(tokenContext).toEqual({
        HIDE_ADVERTISEMENTS: false,
        HIDE_COOKIE_CONSENT_SCREEN: false,
        HIDE_MARKETING_DIALOGS: false,
        DISABLE_NON_FUNCTIONAL_TRACKING: false,
        DISABLE_CONTENT_PAYWALL: false,
        ENABLE_SUBSCRIPTION_ACCESS: false,
      })
    })

    test("should construct correct output when token has clientId and server's clientId match", async () => {
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000)
      const features: FEATURE[] = [FEATURE.CLEAN_WEB]
      const headerValue = await encodeClientHeader(
        { version: CURRENT_PROTOCOL_VERSION, expiresAt, features, clientId },
        privateKey
      )

      const tokenContext = await parseClientToken(headerValue, {
        clientId,
        publicKey,
        features,
      })
      expect(tokenContext).toEqual({
        HIDE_ADVERTISEMENTS: true,
        HIDE_COOKIE_CONSENT_SCREEN: true,
        HIDE_MARKETING_DIALOGS: true,
        DISABLE_NON_FUNCTIONAL_TRACKING: true,
        DISABLE_CONTENT_PAYWALL: false,
        ENABLE_SUBSCRIPTION_ACCESS: false,
      })
    })

    test("should construct correct output when token has clientId and server's clientId do not match", async () => {
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000)
      const features: FEATURE[] = [FEATURE.CLEAN_WEB]
      const headerValue = await encodeClientHeader(
        { version: CURRENT_PROTOCOL_VERSION, expiresAt, features, clientId },
        privateKey
      )

      const differentClientId = randomUUID()
      expect(clientId).not.toEqual(differentClientId)

      const tokenContext = await parseClientToken(headerValue, {
        clientId: differentClientId,
        publicKey,
        features,
      })
      expect(tokenContext).toEqual({
        HIDE_ADVERTISEMENTS: false,
        HIDE_COOKIE_CONSENT_SCREEN: false,
        HIDE_MARKETING_DIALOGS: false,
        DISABLE_NON_FUNCTIONAL_TRACKING: false,
        DISABLE_CONTENT_PAYWALL: false,
        ENABLE_SUBSCRIPTION_ACCESS: false,
      })
    })

    test("should construct correct output when token is expired but clientId and server's clientId match", async () => {
      const expiresAt = new Date(Date.now() - 24 * 3600 * 1000)
      const features: FEATURE[] = [FEATURE.CLEAN_WEB, FEATURE.ONE_PASS]
      const headerValue = await encodeClientHeader(
        { version: CURRENT_PROTOCOL_VERSION, expiresAt, features, clientId },
        privateKey
      )

      const tokenContext = await parseClientToken(headerValue, {
        clientId,
        publicKey,
        features,
      })
      expect(tokenContext).toEqual({
        HIDE_ADVERTISEMENTS: false,
        HIDE_COOKIE_CONSENT_SCREEN: false,
        HIDE_MARKETING_DIALOGS: false,
        DISABLE_NON_FUNCTIONAL_TRACKING: false,
        DISABLE_CONTENT_PAYWALL: false,
        ENABLE_SUBSCRIPTION_ACCESS: false,
      })
    })

    test("should not throw if array of strings is provided", async () => {
      const tokenContext = await parseClientToken(["some-value", "another-value"], {
        clientId,
        publicKey,
        features: [FEATURE.CLEAN_WEB, FEATURE.ONE_PASS],
      })

      expect(tokenContext).toEqual({
        HIDE_ADVERTISEMENTS: false,
        HIDE_COOKIE_CONSENT_SCREEN: false,
        HIDE_MARKETING_DIALOGS: false,
        DISABLE_NON_FUNCTIONAL_TRACKING: false,
        DISABLE_CONTENT_PAYWALL: false,
        ENABLE_SUBSCRIPTION_ACCESS: false,
      })
    })

    test("should not throw if an empty array is provided", async () => {
      const tokenContext = await parseClientToken([], {
        clientId,
        publicKey,
        features: [FEATURE.CLEAN_WEB, FEATURE.ONE_PASS],
      })

      expect(tokenContext).toEqual({
        HIDE_ADVERTISEMENTS: false,
        HIDE_COOKIE_CONSENT_SCREEN: false,
        HIDE_MARKETING_DIALOGS: false,
        DISABLE_NON_FUNCTIONAL_TRACKING: false,
        DISABLE_CONTENT_PAYWALL: false,
        ENABLE_SUBSCRIPTION_ACCESS: false,
      })
    })

    test("should not throw if an undefined param is provided", async () => {
      const tokenContext = await parseClientToken(undefined, {
        clientId,
        publicKey,
        features: [FEATURE.CLEAN_WEB, FEATURE.ONE_PASS],
      })

      expect(tokenContext).toEqual({
        HIDE_ADVERTISEMENTS: false,
        HIDE_COOKIE_CONSENT_SCREEN: false,
        HIDE_MARKETING_DIALOGS: false,
        DISABLE_NON_FUNCTIONAL_TRACKING: false,
        DISABLE_CONTENT_PAYWALL: false,
        ENABLE_SUBSCRIPTION_ACCESS: false,
      })
    })
  })

  describe("encodeClientHeader()", () => {
    test("should lay the payload out as version, nonce, little-endian expiry, little-endian flags, clientId", async () => {
      // The byte layout is the cross-SDK wire contract - the PHP SDK packs these fields with `pack("V")`,
      // so anything but explicit little-endian here breaks interoperability on a big-endian host
      const expiresAt = new Date(1767225600 * 1000) // 2026-01-01T00:00:00Z
      const headerValue = await encodeClientHeader(
        {
          version: CURRENT_PROTOCOL_VERSION,
          expiresAt,
          features: [FEATURE.CLEAN_WEB, FEATURE.ONE_PASS],
          clientId,
        },
        privateKey
      )

      const payload = fromBase64(headerValue.split(".")[0])

      expect(payload[0]).toBe(CURRENT_PROTOCOL_VERSION)
      expect(payload.byteLength).toBe(13 + clientId.length)

      const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
      expect(view.getUint32(5, true)).toBe(1767225600)
      expect(view.getUint32(9, true)).toBe(3)

      expect(new TextDecoder().decode(payload.subarray(13))).toBe(clientId)
    })

    test("should omit the clientId section when no clientId is given", async () => {
      const expiresAt = new Date(Date.now() + 3600 * 1000)

      for (const withoutClientId of [{}, { clientId: "" }, { clientId: undefined }]) {
        const headerValue = await encodeClientHeader(
          {
            version: CURRENT_PROTOCOL_VERSION,
            expiresAt,
            features: [FEATURE.CLEAN_WEB],
            ...withoutClientId,
          },
          privateKey
        )

        expect(fromBase64(headerValue.split(".")[0]).byteLength).toBe(13)
        expect(await decodeClientHeader(headerValue, publicKey)).not.toHaveProperty("clientId")
      }
    })

    test("should use a fresh nonce so identical token contents produce different header values", async () => {
      const expiresAt = new Date(Date.now() + 3600 * 1000)
      const data = {
        version: CURRENT_PROTOCOL_VERSION,
        expiresAt,
        features: [FEATURE.CLEAN_WEB],
      }

      const first = await encodeClientHeader(data, privateKey)
      const second = await encodeClientHeader(data, privateKey)

      expect(first).not.toBe(second)
      expect(fromBase64(first.split(".")[0]).subarray(1, 5)).not.toEqual(
        fromBase64(second.split(".")[0]).subarray(1, 5)
      )
    })

    test("should throw rather than silently wrap an expiry outside the uint32 second range", async () => {
      const outOfRange = [
        new Date("2200-01-01T00:00:00Z"), // Wrapped to 2063 - a token that expires far earlier than asked
        new Date("1960-01-01T00:00:00Z"), // Wrapped to 2096 - a token valid for another 70 years
        new Date(-1),
        new Date(NaN),
      ]

      for (const expiresAt of outOfRange) {
        await expect(
          encodeClientHeader(
            {
              version: CURRENT_PROTOCOL_VERSION,
              expiresAt,
              features: [FEATURE.CLEAN_WEB],
            },
            privateKey
          )
        ).rejects.toThrow(/`expiresAt` value must be a valid date/)
      }
    })

    test("should accept the exact boundaries of the uint32 second range", async () => {
      for (const seconds of [0, 0xffffffff]) {
        const headerValue = await encodeClientHeader(
          {
            version: CURRENT_PROTOCOL_VERSION,
            expiresAt: new Date(seconds * 1000),
            features: [FEATURE.CLEAN_WEB],
          },
          privateKey
        )

        expect((await decodeClientHeader(headerValue, publicKey))?.expiresAt.getTime()).toBe(seconds * 1000)
      }
    })

    test("should throw when the private key is not a usable key", async () => {
      await expect(
        encodeClientHeader(
          {
            version: CURRENT_PROTOCOL_VERSION,
            expiresAt: new Date(Date.now() + 3600 * 1000),
            features: [FEATURE.CLEAN_WEB],
          },
          "not-a-key"
        )
      ).rejects.toThrow()
    })

    test("should round-trip a multi-byte UTF-8 clientId", async () => {
      const unicodeClientId = "site-\u00e6\u00f8\u00e5-\u65e5\u672c\u8a9e-\ud83d\ude80"
      const expiresAt = new Date(Date.now() + 3600 * 1000)

      const headerValue = await encodeClientHeader(
        {
          version: CURRENT_PROTOCOL_VERSION,
          expiresAt,
          features: [FEATURE.CLEAN_WEB],
          clientId: unicodeClientId,
        },
        privateKey
      )

      expect((await decodeClientHeader(headerValue, publicKey))?.clientId).toBe(unicodeClientId)
    })
  })

  describe("decodeClientHeader() malformed input", () => {
    test("should parse as undefined on empty or nullish input", async () => {
      expect(await decodeClientHeader("", publicKey)).toBeUndefined()
      expect(await decodeClientHeader(null, publicKey)).toBeUndefined()
      expect(await decodeClientHeader(undefined, publicKey)).toBeUndefined()
    })

    test("should parse as undefined when the separator is missing", async () => {
      expect(await decodeClientHeader("no-separator-here", publicKey)).toBeUndefined()
    })

    test("should parse as undefined on unparseable base64 sections", async () => {
      expect(await decodeClientHeader(".", publicKey)).toBeUndefined()
      expect(await decodeClientHeader("!!!.???", publicKey)).toBeUndefined()
      expect(await decodeClientHeader("AAAA.", publicKey)).toBeUndefined()
    })

    test("should parse as undefined when extra separators shift the signature", async () => {
      const headerValue = await encodeClientHeader(
        {
          version: CURRENT_PROTOCOL_VERSION,
          expiresAt: new Date(Date.now() + 3600 * 1000),
          features: [FEATURE.CLEAN_WEB],
        },
        privateKey
      )

      expect(await decodeClientHeader(`.${headerValue}`, publicKey)).toBeUndefined()
      expect(await decodeClientHeader(`${headerValue}.trailing`, publicKey)).toBeUndefined()
    })

    test("should parse as undefined when the public key is not a usable key", async () => {
      const headerValue = await encodeClientHeader(
        {
          version: CURRENT_PROTOCOL_VERSION,
          expiresAt: new Date(Date.now() + 3600 * 1000),
          features: [FEATURE.CLEAN_WEB],
        },
        privateKey
      )

      expect(await decodeClientHeader(headerValue, "not-a-key")).toBeUndefined()
      expect(await decodeClientHeader(headerValue, "")).toBeUndefined()
    })

    test("should parse as undefined on a correctly signed but truncated payload", async () => {
      // Signature verification passes, so only the length check stands between this and a bogus DataView read
      for (const length of [1, 5, 9, 12]) {
        const payload = new Uint8Array(length)
        payload[0] = CURRENT_PROTOCOL_VERSION

        expect(await decodeClientHeader(await signPayload(payload), publicKey)).toBeUndefined()
      }
    })

    test("should parse as undefined on a correctly signed unsupported protocol version", async () => {
      for (const version of [0, 2, 255]) {
        const payload = new Uint8Array(13)
        payload[0] = version

        expect(await decodeClientHeader(await signPayload(payload), publicKey)).toBeUndefined()
      }
    })

    test("should decode the shortest valid payload", async () => {
      const payload = new Uint8Array(13)
      payload[0] = CURRENT_PROTOCOL_VERSION

      expect(await decodeClientHeader(await signPayload(payload), publicKey)).toEqual({
        version: CURRENT_PROTOCOL_VERSION,
        expiresAt: new Date(0),
        flags: 0,
      })
    })

    test("should preserve unknown feature bits in the decoded flags", async () => {
      const payload = new Uint8Array(13)
      payload[0] = CURRENT_PROTOCOL_VERSION
      new DataView(payload.buffer).setUint32(9, 0xffffffff, true)

      expect((await decodeClientHeader(await signPayload(payload), publicKey))?.flags).toBe(0xffffffff)
    })
  })

  describe("parseClientToken() boundaries", () => {
    test("should grant features while the token expires in the current second and deny once it has passed", async () => {
      const expiresAt = new Date(Math.floor(Date.now() / 1000) * 1000 + 60_000)
      const headerValue = await encodeClientHeader(
        {
          version: CURRENT_PROTOCOL_VERSION,
          expiresAt,
          features: [FEATURE.CLEAN_WEB],
        },
        privateKey
      )
      const options = {
        clientId,
        publicKey,
        features: [FEATURE.CLEAN_WEB],
        bypassCache: true,
      }

      setSystemTime(expiresAt)
      expect((await parseClientToken(headerValue, options)).HIDE_ADVERTISEMENTS).toBe(true)

      setSystemTime(new Date(expiresAt.getTime() + 1))
      expect((await parseClientToken(headerValue, options)).HIDE_ADVERTISEMENTS).toBe(false)
    })

    test("should ignore unknown feature bits granted by the token", async () => {
      const payload = new Uint8Array(13)
      payload[0] = CURRENT_PROTOCOL_VERSION
      const view = new DataView(payload.buffer)
      view.setUint32(5, Math.floor(Date.now() / 1000) + 3600, true)
      view.setUint32(9, 0xffffffff, true)

      const tokenContext = await parseClientToken(await signPayload(payload), {
        clientId,
        publicKey,
        features: [FEATURE.CLEAN_WEB],
      })

      expect(tokenContext).toEqual({
        ...DENIED_CONTEXT,
        HIDE_ADVERTISEMENTS: true,
        HIDE_COOKIE_CONSENT_SCREEN: true,
        HIDE_MARKETING_DIALOGS: true,
        DISABLE_NON_FUNCTIONAL_TRACKING: true,
      })
    })

    test("should take the Set branch when the site feature list holds more than two entries", async () => {
      const expiresAt = new Date(Date.now() + 3600 * 1000)
      const headerValue = await encodeClientHeader(
        {
          version: CURRENT_PROTOCOL_VERSION,
          expiresAt,
          features: [FEATURE.CLEAN_WEB, FEATURE.ONE_PASS],
        },
        privateKey
      )

      const tokenContext = await parseClientToken(headerValue, {
        clientId,
        publicKey,
        features: [FEATURE.CLEAN_WEB, FEATURE.ONE_PASS, FEATURE.CLEAN_WEB],
      })

      expect(tokenContext).toEqual({
        HIDE_ADVERTISEMENTS: true,
        HIDE_COOKIE_CONSENT_SCREEN: true,
        HIDE_MARKETING_DIALOGS: true,
        DISABLE_NON_FUNCTIONAL_TRACKING: true,
        DISABLE_CONTENT_PAYWALL: true,
        ENABLE_SUBSCRIPTION_ACCESS: true,
      })
    })

    test("should deny everything when the site supports no features", async () => {
      const expiresAt = new Date(Date.now() + 3600 * 1000)
      const headerValue = await encodeClientHeader(
        {
          version: CURRENT_PROTOCOL_VERSION,
          expiresAt,
          features: [FEATURE.CLEAN_WEB, FEATURE.ONE_PASS],
        },
        privateKey
      )

      expect(
        await parseClientToken(headerValue, {
          clientId,
          publicKey,
          features: [],
        })
      ).toEqual(DENIED_CONTEXT)
    })

    test("should deny everything when the header is signed by an untrusted key", async () => {
      const expiresAt = new Date(Date.now() + 3600 * 1000)
      const headerValue = await encodeClientHeader(
        {
          version: CURRENT_PROTOCOL_VERSION,
          expiresAt,
          features: [FEATURE.CLEAN_WEB],
        },
        generateKeys().privateKey
      )

      expect(
        await parseClientToken(headerValue, {
          clientId,
          publicKey,
          features: [FEATURE.CLEAN_WEB],
        })
      ).toEqual(DENIED_CONTEXT)
    })

    test("should use the first value when the header arrives as a repeated header array", async () => {
      const expiresAt = new Date(Date.now() + 3600 * 1000)
      const headerValue = await encodeClientHeader(
        {
          version: CURRENT_PROTOCOL_VERSION,
          expiresAt,
          features: [FEATURE.CLEAN_WEB],
        },
        privateKey
      )

      const tokenContext = await parseClientToken([headerValue, "ignored-second-value"], {
        clientId,
        publicKey,
        features: [FEATURE.CLEAN_WEB],
      })

      expect(tokenContext.HIDE_ADVERTISEMENTS).toBe(true)
    })

    test("should deny everything on an empty string header value", async () => {
      expect(
        await parseClientToken("", {
          clientId,
          publicKey,
          features: [FEATURE.CLEAN_WEB],
        })
      ).toEqual(DENIED_CONTEXT)
    })

    test("should fall back to the network public key when none is supplied", async () => {
      const expiresAt = new Date(Date.now() + 3600 * 1000)
      const headerValue = await encodeClientHeader(
        {
          version: CURRENT_PROTOCOL_VERSION,
          expiresAt,
          features: [FEATURE.CLEAN_WEB],
        },
        privateKey
      )

      expect(
        await parseClientToken(headerValue, {
          clientId,
          features: [FEATURE.CLEAN_WEB],
        })
      ).toEqual(DENIED_CONTEXT)
      expect(ZEROAD_NETWORK_PUBLIC_KEY).not.toBe(publicKey)
    })
  })
})
