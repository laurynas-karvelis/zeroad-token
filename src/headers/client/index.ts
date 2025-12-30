import { PROTOCOL_VERSION, FEATURE, ZEROAD_NETWORK_PUBLIC_KEY } from "../../constants";
import { cacheConfig, cleanExpiredEntries, headerCache, trimCache } from "./cache";
import { fromBase64, setFlags, toBase64 } from "../../helpers";
import { nonce, sign, verify } from "../../crypto";
import { log } from "../../logger";

const VERSION_BYTES = 1;
const NONCE_BYTES = 4;
const SEPARATOR = ".";
const UINT32_BYTES = 4;

export type FEATURE_ACTION =
  | "HIDE_ADVERTISEMENTS"
  | "HIDE_COOKIE_CONSENT_SCREEN"
  | "HIDE_MARKETING_DIALOGS"
  | "DISABLE_NON_FUNCTIONAL_TRACKING"
  | "DISABLE_CONTENT_PAYWALL"
  | "ENABLE_SUBSCRIPTION_ACCESS";

export type ClientHeaderValue = string | string[] | undefined;
export type TokenContext = Record<FEATURE_ACTION, boolean>;

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
} as Record<FEATURE, ReadonlyArray<FEATURE_ACTION>>);

const FEATURE_NUMBERS = Object.freeze([FEATURE.CLEAN_WEB, FEATURE.ONE_PASS] as const);

export type ParseClientTokenOptions = {
  clientId: string;
  features: FEATURE[];
  publicKey?: string;
  bypassCache?: boolean; // Allow per-call cache bypass
};

const EMPTY_CONTEXT: TokenContext = Object.freeze({
  HIDE_ADVERTISEMENTS: false,
  HIDE_COOKIE_CONSENT_SCREEN: false,
  HIDE_MARKETING_DIALOGS: false,
  DISABLE_NON_FUNCTIONAL_TRACKING: false,
  DISABLE_CONTENT_PAYWALL: false,
  ENABLE_SUBSCRIPTION_ACCESS: false,
}) as TokenContext;

function createEmptyContext(): TokenContext {
  return EMPTY_CONTEXT;
}

export async function parseClientToken(
  headerValue: ClientHeaderValue,
  options: ParseClientTokenOptions
): Promise<TokenContext> {
  if (!headerValue || (Array.isArray(headerValue) && !headerValue.length)) {
    return createEmptyContext();
  }

  const headerValueAsString = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const now = Date.now();

  if (cacheConfig.enabled && !options.bypassCache) {
    const cached = headerCache.get(headerValueAsString);

    if (cached && cached.effectiveExpiry > now) {
      cached.accessCount++;
      return buildContext(cached.data, options, now);
    } else if (cached) {
      headerCache.delete(headerValueAsString);
    }
  }

  const data = await decodeClientHeader(headerValueAsString, options.publicKey || ZEROAD_NETWORK_PUBLIC_KEY);

  if (cacheConfig.enabled && !options.bypassCache) {
    const cacheTTLExpiry = now + cacheConfig.ttl;
    const tokenExpiry = data?.expiresAt.getTime() ?? 0;
    const effectiveExpiry = tokenExpiry > 0 ? Math.min(cacheTTLExpiry, tokenExpiry) : cacheTTLExpiry;

    headerCache.set(headerValueAsString, {
      data,
      timestamp: now,
      accessCount: 1,
      effectiveExpiry,
    });

    // Periodically clean expired entries (every 100th parse)
    if (headerCache.size > 0 && headerCache.size % 100 === 0) {
      cleanExpiredEntries(now);
    }

    trimCache();
  }

  return buildContext(data, options, now);
}

function buildContext(
  data: DecodedClientHeader | undefined,
  options: ParseClientTokenOptions,
  now: number
): TokenContext {
  let flags = 0;

  if (data && data.expiresAt.getTime() >= now) {
    // Validate `clientId` if present (developer token)
    if (!data.clientId || data.clientId === options.clientId) {
      flags = data.flags;
    }
  }

  if (!flags) {
    return createEmptyContext();
  }

  const featuresSet =
    options.features.length <= 2
      ? options.features // For small arrays, direct iteration is faster than Set creation
      : new Set(options.features);

  const context = {} as TokenContext;

  for (let i = 0; i < FEATURE_NUMBERS.length; i++) {
    const feature = FEATURE_NUMBERS[i];
    const actionNames = FEATURE_TO_ACTIONS[feature];

    // Check if site supports the feature AND token grants it
    const isEnabled =
      (Array.isArray(featuresSet) ? featuresSet.includes(feature) : featuresSet.has(feature)) &&
      (flags & feature) !== 0;

    // Unrolled loop for action assignment (max 4 actions per feature)
    const len = actionNames.length;
    if (len > 0) context[actionNames[0]] = isEnabled;
    if (len > 1) context[actionNames[1]] = isEnabled;
    if (len > 2) context[actionNames[2]] = isEnabled;
    if (len > 3) context[actionNames[3]] = isEnabled;
  }

  return context;
}

export type DecodedClientHeader = {
  version: PROTOCOL_VERSION;
  expiresAt: Date;
  flags: number;
  clientId?: string;
};

export async function decodeClientHeader(
  headerValue: string | null | undefined,
  publicKey: string
): Promise<DecodedClientHeader | undefined> {
  if (!headerValue?.length) return undefined;

  try {
    const separatorIndex = headerValue.indexOf(SEPARATOR);
    if (separatorIndex === -1) {
      throw new Error("Invalid header format: missing separator");
    }

    const data = headerValue.substring(0, separatorIndex);
    const signature = headerValue.substring(separatorIndex + 1);

    const dataBytes = fromBase64(data);
    const signatureBytes = fromBase64(signature);

    if (!(await verify(dataBytes.buffer as ArrayBuffer, signatureBytes.buffer as ArrayBuffer, publicKey))) {
      throw new Error("Forged header value is provided");
    }

    const version = dataBytes[0];

    if (version === PROTOCOL_VERSION.V_1) {
      const expectedMinLength = VERSION_BYTES + NONCE_BYTES + UINT32_BYTES * 2;

      if (dataBytes.byteLength < expectedMinLength) {
        throw new Error("Invalid data length");
      }

      const view = new DataView(dataBytes.buffer, dataBytes.byteOffset, dataBytes.byteLength);
      const expiresAtOffset = VERSION_BYTES + NONCE_BYTES;
      const flagsOffset = expiresAtOffset + UINT32_BYTES;

      const expiresAt = view.getUint32(expiresAtOffset, true);
      const flags = view.getUint32(flagsOffset, true);

      let clientId: string | undefined;
      if (dataBytes.byteLength > expectedMinLength) {
        // The `clientId` is included
        const clientIdBytes = dataBytes.subarray(expectedMinLength);
        clientId = new TextDecoder().decode(clientIdBytes);
      }

      return {
        version,
        expiresAt: new Date(expiresAt * 1000),
        flags,
        ...(clientId && { clientId }),
      };
    }

    throw new Error(`Unsupported protocol version: ${version}`);
  } catch (err) {
    log("warn", "Could not decode client header value", { reason: (err as Error)?.message });
    return undefined;
  }
}

type EncodeData = {
  version: PROTOCOL_VERSION;
  expiresAt: Date;
  features: FEATURE[];
  clientId?: string;
};

export async function encodeClientHeader(data: EncodeData, privateKey: string) {
  const payload = mergeByteArrays([
    new Uint8Array([data.version]),
    new Uint8Array(nonce(NONCE_BYTES)),
    new Uint32Array([Math.floor(data.expiresAt.getTime() / 1000)]),
    new Uint32Array([setFlags(data.features)]),
    ...(data.clientId?.length ? [new Uint8Array(new TextEncoder().encode(data.clientId))] : []),
  ]);

  return [toBase64(payload), toBase64(new Uint8Array(await sign(payload.buffer, privateKey)))].join(SEPARATOR);
}

function mergeByteArrays(arrays: (Uint8Array | Uint32Array)[]) {
  const totalLength = arrays.reduce((sum, a) => sum + a.byteLength, 0);
  const data = new Uint8Array(totalLength);

  let offset = 0;
  for (const arr of arrays) {
    let bytes: Uint8Array;

    if (arr instanceof Uint8Array) bytes = arr;
    else if (arr instanceof Uint32Array) bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    else throw new Error("Unsupported type");

    data.set(bytes, offset);
    offset += bytes.byteLength;
  }

  return data;
}
