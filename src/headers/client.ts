import { PROTOCOL_VERSION, FEATURES } from "../constants";
import { fromBase64, getSiteFeaturesNative, hasFlag, setFlags, toBase64 } from "../helpers";
import { KeyObject, nonce, sign, verify } from "../crypto";
import { log } from "../logger";

const VERSION_BYTES = 1;
const NONCE_BYTES = 4;
const SEPARATOR = ".";

const SITE_FEATURES_NATIVE = getSiteFeaturesNative();

export type FEATURE_FLAG =
  | "ADVERTISEMENTS"
  | "COOKIE_CONSENT_SCREEN"
  | "NON_FUNCTIONAL_TRACKING"
  | "MARKETING_DIALOGS"
  | "CONTENT_PAYWALL"
  | "SUBSCRIPTION_ACCESS";

export type ClientHeaderValue = string | string[] | undefined;
export type FeatureFlags = Record<FEATURE_FLAG, boolean>;

export function parseClientToken(headerValue: ClientHeaderValue, clientId: string, publicKey: KeyObject): FeatureFlags {
  const headerValueAsString = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const data = decodeClientHeader(headerValueAsString, publicKey);

  let flags = 0;

  // Test for no data or token is already expired
  if (data && data.expiresAt.getTime() >= Date.now()) flags = data.flags;

  // Test if developer token is provided and granted `clientId` matches current `clientId`
  if (flags && data?.clientId && data.clientId !== clientId) flags = 0;

  const features = SITE_FEATURES_NATIVE.map(([feature, shift]) => hasFlag(flags, shift) && feature).filter((e) => !!e);
  const hasCleanWeb = features.includes("CLEAN_WEB");
  const hasOnePass = features.includes("ONE_PASS");

  return {
    ADVERTISEMENTS: !hasCleanWeb,
    COOKIE_CONSENT_SCREEN: !hasCleanWeb,
    NON_FUNCTIONAL_TRACKING: !hasCleanWeb,
    MARKETING_DIALOGS: !hasCleanWeb,
    CONTENT_PAYWALL: !hasOnePass,
    SUBSCRIPTION_ACCESS: hasOnePass,
  };
}

export type DecodedClientHeader = {
  version: PROTOCOL_VERSION;
  expiresAt: Date;
  flags: number;
  clientId?: string;
};

export function decodeClientHeader(
  headerValue: string | undefined,
  publicKey: KeyObject
): DecodedClientHeader | undefined {
  if (!headerValue?.length) return;

  try {
    const [data, signature] = headerValue.split(SEPARATOR);
    const dataBytes = fromBase64(data);
    const signatureBytes = fromBase64(signature);

    if (!verify(dataBytes.buffer as ArrayBuffer, signatureBytes.buffer as ArrayBuffer, publicKey)) {
      throw new Error("Forged header value is provided");
    }

    const version = dataBytes[0];
    let clientId;

    if (version === PROTOCOL_VERSION.V_1) {
      const expiresAt = as32BitNumber(dataBytes, VERSION_BYTES + NONCE_BYTES);
      const flags = as32BitNumber(dataBytes, VERSION_BYTES + NONCE_BYTES + Uint32Array.BYTES_PER_ELEMENT);

      const expectedByteLength = VERSION_BYTES + NONCE_BYTES + Uint32Array.BYTES_PER_ELEMENT * 2;

      if (dataBytes.byteLength > expectedByteLength) {
        // `clientId` is included
        clientId = new TextDecoder().decode(dataBytes.subarray(expectedByteLength));
      }

      return { version, expiresAt: new Date(expiresAt * 1000), flags, ...(clientId && { clientId }) };
    }
  } catch (err) {
    log("warn", "Could not decode client header value", { reason: (err as Error)?.message });
  }
}

type EncodeData = { version: PROTOCOL_VERSION; expiresAt: Date; features: FEATURES[]; clientId?: string };

export function encodeClientHeader(data: EncodeData, privateKey: KeyObject) {
  const payload = mergeByteArrays([
    new Uint8Array([data.version]),
    new Uint8Array(nonce(NONCE_BYTES)),
    new Uint32Array([Math.floor(data.expiresAt.getTime() / 1000)]),
    new Uint32Array([setFlags(data.features)]),
    ...(data.clientId?.length ? [new Uint8Array(new TextEncoder().encode(data.clientId))] : []),
  ]);

  return [toBase64(payload), toBase64(new Uint8Array(sign(payload.buffer, privateKey)))].join(SEPARATOR);
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

function as32BitNumber(byteArray: Uint8Array, begin: number) {
  const bytes = byteArray.subarray(begin, begin + Uint32Array.BYTES_PER_ELEMENT);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(0, true);
}
