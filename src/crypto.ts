import { Buffer } from "node:buffer";
import {
  createPrivateKey,
  createPublicKey,
  sign as nodeSign,
  verify as nodeVerify,
  randomBytes,
  generateKeyPairSync,
  KeyObject,
} from "node:crypto";

const keyCache = new Map<string, KeyObject>();

export const generateKeys = () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");

  const privateBase64 = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
  const publicBase64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");

  return {
    privateKey: privateBase64,
    publicKey: publicBase64,
  };
};

const importPrivateKey = (privateKeyBase64: string) => {
  if (keyCache.has(privateKeyBase64)) return keyCache.get(privateKeyBase64) as KeyObject;

  const key = createPrivateKey({
    key: Buffer.from(privateKeyBase64, "base64"),
    format: "der",
    type: "pkcs8",
  });

  keyCache.set(privateKeyBase64, key);
  return key;
};

const importPublicKey = (publicKeyBase64: string) => {
  if (keyCache.has(publicKeyBase64)) return keyCache.get(publicKeyBase64) as KeyObject;

  const key = createPublicKey({
    key: Buffer.from(publicKeyBase64, "base64"),
    format: "der",
    type: "spki",
  });

  keyCache.set(publicKeyBase64, key);
  return key;
};

export const sign = (data: ArrayBuffer, privateKey: string) => {
  const key = importPrivateKey(privateKey);
  return nodeSign(null, Buffer.from(data), key);
};

export const verify = (data: ArrayBuffer, signature: ArrayBuffer, publicKey: string) => {
  const key = importPublicKey(publicKey);
  return nodeVerify(null, Buffer.from(data), key, Buffer.from(signature));
};

export const nonce = (size: number) => new Uint8Array(randomBytes(size));
