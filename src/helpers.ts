import { SITE_FEATURES, UUID } from "./constants";

export const toBase64 = (data: Uint8Array) => {
  if (typeof data.toBase64 === "function") return data.toBase64() as string;
  if (typeof Buffer !== "undefined") return Buffer.from(data).toString("base64") as string;

  if (typeof btoa === "function") {
    let binary = "";
    for (let i = 0; i < data.length; i++) {
      binary += String.fromCharCode(data[i]);
    }
    return btoa(binary);
  }

  throw new Error("Base64 encoding not supported in this environment");
};

export const fromBase64 = (input: string) => {
  if (typeof Uint8Array.fromBase64 === "function") return Uint8Array.fromBase64(input) as Uint8Array;
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(input, "base64"));

  if (typeof atob === "function") {
    const binary = atob(input);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  throw new Error("Base64 decoding not supported in this environment");
};

export const uuidToBase64 = (uuid: UUID): string => {
  const hex = uuid.replace(/-/g, "");

  if (hex.length !== 32) throw new Error("Invalid UUID format");

  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }

  return toBase64(bytes).replace(/=+$/, "");
};

export const base64ToUuid = (input: string): string => {
  const bytes = fromBase64(input + "===".slice((input.length + 3) % 4));

  if (bytes.length !== 16) throw new Error("Invalid byte length for UUID");

  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return [
    hex.slice(0, 8),
    hex.slice(8, 8 + 4),
    hex.slice(12, 12 + 4),
    hex.slice(16, 16 + 4),
    hex.slice(20, 20 + 12),
  ].join("-");
};

export const unixTimestampToBytes = (date: Date) => {
  const buffer = new ArrayBuffer(4);
  new DataView(buffer).setUint32(0, Math.floor(date.getTime() / 1000));
  return new Uint8Array(buffer);
};

export const bytesToUnixTimestamp = (bytes: Uint8Array) => {
  const u32int = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
  return new Date(u32int * 1000);
};

export const assert = (value: unknown, message: string) => {
  if (!value) throw new Error(message);
};

export const hasFeature = (flags: number, feature: SITE_FEATURES) => Boolean(flags & feature);
export const clearFeature = (flags: number, feature: SITE_FEATURES) => (flags &= ~feature);
export const toggleFeature = (flags: number, feature: SITE_FEATURES) => (flags ^= feature);
export const setFeatures = (flags: number = 0, features: SITE_FEATURES[] = []) =>
  (flags |= features.reduce((acc, feature) => acc | feature, flags || 0));
