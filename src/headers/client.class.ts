import { CLIENT_HEADERS, ClientHeaderParseResult, PROTOCOL_VERSION, SITE_FEATURES } from "../constants";
import { bytesToUnixTimestamp, fromBase64, hasFeature, setFeatures, toBase64, unixTimestampToBytes } from "../helpers";
import { importPrivateKey, importPublicKey, nonce, sign, verify } from "../subtle.crypto";

const NONCE_BYTES = 4;
const SEPARATOR = ".";

export class ClientHeader {
  private cryptoPublicKey: CryptoKey | undefined;
  private cryptoPrivateKey: CryptoKey | undefined;

  private publicKey;
  private privateKey;

  name = CLIENT_HEADERS.HELLO;

  constructor(publicKey: string, privateKey?: string) {
    this.publicKey = publicKey;
    this.privateKey = privateKey;
  }

  async encode(version: PROTOCOL_VERSION, expiresAt: Date, features: SITE_FEATURES[]) {
    if (!this.privateKey) throw new Error("Private key is required");

    const flags = setFeatures(0, features);
    const data = mergeByteArrays([
      new Uint8Array([version]),
      nonce(NONCE_BYTES),
      unixTimestampToBytes(expiresAt),
      new Uint8Array([flags]),
    ]);

    if (!this.cryptoPrivateKey) this.cryptoPrivateKey = await importPrivateKey(this.privateKey);
    const signature = await sign(data.buffer, this.cryptoPrivateKey);

    return [toBase64(data), toBase64(new Uint8Array(signature))].join(SEPARATOR);
  }

  async decode(headerValue: string): Promise<ClientHeaderParseResult> {
    if (!headerValue?.length) return;
    if (!this.cryptoPublicKey) this.cryptoPublicKey = await importPublicKey(this.publicKey);

    try {
      const [data, signature] = headerValue.split(SEPARATOR);
      const dataBytes = fromBase64(data);
      const signatureBytes = fromBase64(signature);

      if (
        !(await verify(dataBytes.buffer as ArrayBuffer, signatureBytes.buffer as ArrayBuffer, this.cryptoPublicKey))
      ) {
        throw new Error("Forged header value is provided");
      }

      const version = dataBytes[0];

      if (version === PROTOCOL_VERSION.V_1) {
        const flagsBytes = dataBytes.subarray(dataBytes.length - 1, dataBytes.length);
        const expiresAtBytes = dataBytes.subarray(5, 9);
        const expiresAt = bytesToUnixTimestamp(expiresAtBytes);
        const expired = expiresAt.getTime() < Date.now();

        return { version, expiresAt, expired, flags: flagsBytes[0] };
      }
    } catch (e) {}
  }

  async processRequest(headerValue: string | undefined) {
    const data = await this.decode(headerValue as string);
    return {
      data,
      shouldRemoveAds: () => shouldRemoveAds(data),
      shouldEnablePremiumContentAccess: () => shouldEnablePremiumContentAccess(data),
      shouldEnableVipExperience: () => shouldEnableVipExperience(data),
    };
  }
}

const test = (data: ClientHeaderParseResult, feature: SITE_FEATURES) => {
  return (data && !data?.expired && hasFeature(data?.flags, feature)) || false;
};

const shouldRemoveAds = (data: ClientHeaderParseResult) => test(data, SITE_FEATURES.ADLESS_EXPERIENCE);
const shouldEnableVipExperience = (data: ClientHeaderParseResult) => test(data, SITE_FEATURES.VIP_EXPERIENCE);
const shouldEnablePremiumContentAccess = (data: ClientHeaderParseResult) =>
  test(data, SITE_FEATURES.PREMIUM_CONTENT_ACCESS);

const mergeByteArrays = (arrays: Uint8Array[]) => {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const data = new Uint8Array(totalLength);

  let offset = 0;
  for (const arr of arrays) {
    data.set(arr, offset);
    offset += arr.length;
  }

  return data;
};
