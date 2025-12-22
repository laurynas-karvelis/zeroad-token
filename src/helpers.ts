import { FEATURE } from "./constants";

export const FEATURE_MAP = new Map<keyof typeof FEATURE, number>(
  Object.entries(FEATURE).filter(([k]) => isNaN(Number(k))) as [keyof typeof FEATURE, number][]
);

export function toBase64(data: Uint8Array) {
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
}

export let fromBase64: (input: string) => Uint8Array;

if (typeof Uint8Array.fromBase64 === "function") fromBase64 = (input: string) => Uint8Array.fromBase64(input);
else if (typeof Buffer !== "undefined") fromBase64 = (input: string) => new Uint8Array(Buffer.from(input, "base64"));
else if (typeof atob === "function") {
  fromBase64 = (input: string) => {
    const binary = atob(input);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  };
} else {
  throw new Error("Base64 decoding not supported in this environment");
}

export function assert(value: unknown, message: string) {
  if (!value) throw new Error(message);
}

export const hasFlag = (bit: number, flags: number) => Boolean(bit & flags);
export const setFlags = (features: FEATURE[] = []) => features.reduce((acc, feature) => acc | feature, 0);
