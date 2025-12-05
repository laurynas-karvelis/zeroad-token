import { CURRENT_PROTOCOL_VERSION, PROTOCOL_VERSION, FEATURES } from "../constants";
import { assert, getSiteFeaturesNative, hasFlag, setFlags } from "../helpers";
import { log } from "../logger";

const SEPARATOR = "^";
const SITE_FEATURES_NATIVE = getSiteFeaturesNative();

const validFeatureValues = Object.values(FEATURES).filter((key) => !isNaN(Number(key))) as FEATURES[];
const validFeatureKeys = Object.values(FEATURES).filter((key) => isNaN(Number(key))) as FEATURES[];

export function encodeServerHeader(clientId: string, features: FEATURES[]) {
  if (!clientId?.length) {
    throw new Error("The provided `clientId` value cannot be an empty string");
  }

  if (!features?.length) {
    throw new Error("At least one Site feature must be provided");
  }

  if (features.filter((feature) => validFeatureValues.includes(feature)).length !== features.length) {
    throw new Error(`Only valid Site features are allowed: ${validFeatureKeys.join(" | ")}`);
  }

  return [clientId, CURRENT_PROTOCOL_VERSION, setFlags(features)].join(SEPARATOR);
}

export type WelcomeHeader = {
  clientId: string;
  version: PROTOCOL_VERSION;
  features: (keyof typeof FEATURES)[];
};

export function decodeServerHeader(headerValue: string | undefined): WelcomeHeader | undefined {
  if (!headerValue?.length) return;

  try {
    const parts = headerValue.split(SEPARATOR);
    assert(parts.length === 3, "Invalid header value format");

    const [clientId, protocolVersion, flags] = parts;
    assert(
      Object.values(PROTOCOL_VERSION).includes(Number(protocolVersion)),
      "Invalid or unsupported protocol version"
    );

    assert(Number(flags).toFixed(0).toString() === flags, "Invalid flags number");

    let features: (keyof typeof FEATURES)[] = [];
    for (const [feature, shift] of SITE_FEATURES_NATIVE) {
      if (hasFlag(Number(flags), shift)) features.push(feature);
    }

    return {
      version: Number(protocolVersion),
      clientId,
      features,
    };
  } catch (err) {
    log("warn", "Could not decode server header value", { reason: (err as Error)?.message });
  }
}
