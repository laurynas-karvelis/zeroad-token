import { FEATURES } from "./constants";

type SiteFeaturesNative = [keyof typeof FEATURES, FEATURES][];
let SITE_FEATURES_NATIVE: SiteFeaturesNative;

export const getSiteFeaturesNative = (): SiteFeaturesNative => {
  if (SITE_FEATURES_NATIVE?.length) return SITE_FEATURES_NATIVE;

  return (SITE_FEATURES_NATIVE = Object.entries(FEATURES).filter(([key]) => isNaN(Number(key))) as SiteFeaturesNative);
};

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

export const assert = (value: unknown, message: string) => {
  if (!value) throw new Error(message);
};

export const hasFlag = (flag: number, flags: number) => Boolean(flag & flags);
export const setFlags = (features: FEATURES[] = []) => features.reduce((acc, feature) => acc | feature, 0);
