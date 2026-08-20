import { FEATURE, PROTOCOL_VERSION, ZEROAD_NETWORK_PUBLIC_KEY } from "../../constants"
import { nonce, sign, verify } from "../../crypto"
import { fromBase64, setFlags, toBase64 } from "../../helpers"
import { log } from "../../logger"
import { cacheConfig, cleanExpiredEntries, headerCache, trimCache } from "./cache"

const VERSION_BYTES = 1
const NONCE_BYTES = 4
const SEPARATOR = "."
const UINT32_BYTES = 4

const EXPIRES_AT_OFFSET = VERSION_BYTES + NONCE_BYTES
const FLAGS_OFFSET = EXPIRES_AT_OFFSET + UINT32_BYTES
const PREFIX_BYTES = FLAGS_OFFSET + UINT32_BYTES // Everything up to the optional `clientId` suffix
const MAX_UINT32 = 0xffffffff

const CLEANUP_PARSE_INTERVAL = 100
let parsesSinceLastCleanup = 0

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

export type FEATURE_ACTION =
  | "HIDE_ADVERTISEMENTS"
  | "HIDE_COOKIE_CONSENT_SCREEN"
  | "HIDE_MARKETING_DIALOGS"
  | "DISABLE_NON_FUNCTIONAL_TRACKING"
  | "DISABLE_CONTENT_PAYWALL"
  | "ENABLE_SUBSCRIPTION_ACCESS"

export type ClientHeaderValue = string | string[] | undefined
export type TokenContext = Record<FEATURE_ACTION, boolean>

const FEATURE_TO_ACTIONS: Readonly<Record<FEATURE, ReadonlyArray<FEATURE_ACTION>>> = Object.freeze({
  [FEATURE.CLEAN_WEB]: Object.freeze([
    "HIDE_ADVERTISEMENTS" as const,
    "HIDE_COOKIE_CONSENT_SCREEN" as const,
    "HIDE_MARKETING_DIALOGS" as const,
    "DISABLE_NON_FUNCTIONAL_TRACKING" as const,
  ] as FEATURE_ACTION[]),
  [FEATURE.ONE_PASS]: Object.freeze([
    "DISABLE_CONTENT_PAYWALL" as const,
    "ENABLE_SUBSCRIPTION_ACCESS" as const,
  ] as FEATURE_ACTION[]),
} as Record<FEATURE, ReadonlyArray<FEATURE_ACTION>>)

const FEATURE_NUMBERS = Object.freeze([FEATURE.CLEAN_WEB, FEATURE.ONE_PASS] as const)

export type ParseClientTokenOptions = {
  clientId: string
  features: FEATURE[]
  publicKey?: string
  bypassCache?: boolean // Allow per-call cache bypass
}

const EMPTY_CONTEXT: TokenContext = Object.freeze({
  HIDE_ADVERTISEMENTS: false,
  HIDE_COOKIE_CONSENT_SCREEN: false,
  HIDE_MARKETING_DIALOGS: false,
  DISABLE_NON_FUNCTIONAL_TRACKING: false,
  DISABLE_CONTENT_PAYWALL: false,
  ENABLE_SUBSCRIPTION_ACCESS: false,
}) as TokenContext

function createEmptyContext(): TokenContext {
  return EMPTY_CONTEXT
}

export async function parseClientToken(
  headerValue: ClientHeaderValue,
  options: ParseClientTokenOptions
): Promise<TokenContext> {
  if (!headerValue || (Array.isArray(headerValue) && !headerValue.length)) {
    return createEmptyContext()
  }

  const headerValueAsString = Array.isArray(headerValue) ? headerValue[0] : headerValue
  const publicKey = options.publicKey || ZEROAD_NETWORK_PUBLIC_KEY
  const now = Date.now()
  const useCache = cacheConfig.enabled && !options.bypassCache

  if (useCache) {
    const cached = headerCache.get(headerValueAsString)

    if (cached) {
      // An entry verified against a different public key says nothing about this call - reusing it
      // would let a token signed by any previously trusted key through under the current one
      if (cached.effectiveExpiry > now && cached.publicKey === publicKey) {
        cached.accessCount++
        return buildContext(cached.data, options, now)
      }

      headerCache.delete(headerValueAsString)
    }
  }

  const data = await decodeClientHeader(headerValueAsString, publicKey)

  if (useCache) {
    const cacheTTLExpiry = now + cacheConfig.ttl
    const tokenExpiry = data?.expiresAt.getTime() ?? 0
    const effectiveExpiry = tokenExpiry > 0 ? Math.min(cacheTTLExpiry, tokenExpiry) : cacheTTLExpiry

    headerCache.set(headerValueAsString, {
      data,
      timestamp: now,
      accessCount: 1,
      effectiveExpiry,
      publicKey,
    })

    // Periodically clean expired entries. Counting parses rather than testing `headerCache.size`:
    // `trimCache()` pins the size at `maxSize`, so a size-based check stops firing once the cache fills
    if (++parsesSinceLastCleanup >= CLEANUP_PARSE_INTERVAL) {
      parsesSinceLastCleanup = 0
      cleanExpiredEntries(now)
    }

    trimCache()
  }

  return buildContext(data, options, now)
}

function buildContext(
  data: DecodedClientHeader | undefined,
  options: ParseClientTokenOptions,
  now: number
): TokenContext {
  let flags = 0

  if (data && data.expiresAt.getTime() >= now) {
    // Validate `clientId` if present (developer token)
    if (!data.clientId || data.clientId === options.clientId) {
      flags = data.flags
    }
  }

  if (!flags) {
    return createEmptyContext()
  }

  const featuresSet =
    options.features.length <= 2
      ? options.features // For small arrays, direct iteration is faster than Set creation
      : new Set(options.features)

  const context = {} as TokenContext

  for (let i = 0; i < FEATURE_NUMBERS.length; i++) {
    const feature = FEATURE_NUMBERS[i]
    const actionNames = FEATURE_TO_ACTIONS[feature]

    // Check if site supports the feature AND token grants it
    const isEnabled =
      (Array.isArray(featuresSet) ? featuresSet.includes(feature) : featuresSet.has(feature)) && (flags & feature) !== 0

    // Unrolled loop for action assignment (max 4 actions per feature)
    const len = actionNames.length
    if (len > 0) context[actionNames[0]] = isEnabled
    if (len > 1) context[actionNames[1]] = isEnabled
    if (len > 2) context[actionNames[2]] = isEnabled
    if (len > 3) context[actionNames[3]] = isEnabled
  }

  return context
}

export type DecodedClientHeader = {
  version: PROTOCOL_VERSION
  expiresAt: Date
  flags: number
  clientId?: string
}

export async function decodeClientHeader(
  headerValue: string | null | undefined,
  publicKey: string
): Promise<DecodedClientHeader | undefined> {
  if (!headerValue?.length) return undefined

  try {
    const separatorIndex = headerValue.indexOf(SEPARATOR)
    if (separatorIndex === -1) {
      throw new Error("Invalid header format: missing separator")
    }

    const data = headerValue.substring(0, separatorIndex)
    const signature = headerValue.substring(separatorIndex + 1)

    const dataBytes = fromBase64(data)
    const signatureBytes = fromBase64(signature)

    if (!(await verify(dataBytes.buffer as ArrayBuffer, signatureBytes.buffer as ArrayBuffer, publicKey))) {
      throw new Error("Forged header value is provided")
    }

    const version = dataBytes[0]

    if (version === PROTOCOL_VERSION.V_1) {
      if (dataBytes.byteLength < PREFIX_BYTES) {
        throw new Error("Invalid data length")
      }

      const view = new DataView(dataBytes.buffer, dataBytes.byteOffset, dataBytes.byteLength)

      const expiresAt = view.getUint32(EXPIRES_AT_OFFSET, true)
      const flags = view.getUint32(FLAGS_OFFSET, true)

      let clientId: string | undefined
      if (dataBytes.byteLength > PREFIX_BYTES) {
        // The `clientId` is included
        clientId = textDecoder.decode(dataBytes.subarray(PREFIX_BYTES))
      }

      return {
        version,
        expiresAt: new Date(expiresAt * 1000),
        flags,
        ...(clientId && { clientId }),
      }
    }

    throw new Error(`Unsupported protocol version: ${version}`)
  } catch (err) {
    log("warn", "Could not decode client header value", {
      reason: (err as Error)?.message,
    })
    return undefined
  }
}

type EncodeData = {
  version: PROTOCOL_VERSION
  expiresAt: Date
  features: FEATURE[]
  clientId?: string
}

export async function encodeClientHeader(data: EncodeData, privateKey: string) {
  const expiresAtSeconds = Math.floor(data.expiresAt.getTime() / 1000)

  // The wire format carries the expiry as an unsigned 32-bit second count. Out of range values used to
  // wrap silently, which turned a pre-epoch date into a token valid for decades
  if (!Number.isFinite(expiresAtSeconds) || expiresAtSeconds < 0 || expiresAtSeconds > MAX_UINT32) {
    throw new Error("The `expiresAt` value must be a valid date between 1970-01-01 and 2106-02-07")
  }

  const clientIdBytes = data.clientId?.length ? textEncoder.encode(data.clientId) : undefined
  const payload = new Uint8Array(PREFIX_BYTES + (clientIdBytes?.byteLength ?? 0))

  payload[0] = data.version
  payload.set(nonce(NONCE_BYTES), VERSION_BYTES)

  // Both numeric fields are written little-endian explicitly: a `Uint32Array` byte view would use the
  // host's endianness, while the decoder here and the other language SDKs always read little-endian
  const view = new DataView(payload.buffer)
  view.setUint32(EXPIRES_AT_OFFSET, expiresAtSeconds, true)
  view.setUint32(FLAGS_OFFSET, setFlags(data.features), true)

  if (clientIdBytes) payload.set(clientIdBytes, PREFIX_BYTES)

  return [toBase64(payload), toBase64(new Uint8Array(await sign(payload.buffer, privateKey)))].join(SEPARATOR)
}
