import { CURRENT_PROTOCOL_VERSION, PROTOCOL_VERSION, FEATURE } from "../constants";
import { assert, FEATURE_MAP, hasFlag, setFlags } from "../helpers";
import { log } from "../logger";

const SEPARATOR = "^";

const validFeatureValues = Object.values(FEATURE).filter((key) => !isNaN(Number(key))) as FEATURE[];
const validFeatureKeys = Object.values(FEATURE).filter((key) => isNaN(Number(key))) as FEATURE[];

export function encodeServerHeader(clientId: string, features: FEATURE[]) {
  if (!clientId?.length) {
    throw new Error("The provided `clientId` value cannot be an empty string");
  }

  if (!features?.length) {
    throw new Error("At least one site feature must be provided");
  }

  if (features.filter((feature) => validFeatureValues.includes(feature)).length !== features.length) {
    throw new Error(`Only valid site features are allowed: ${validFeatureKeys.join(" | ")}`);
  }

  return [clientId, CURRENT_PROTOCOL_VERSION, setFlags(features)].join(SEPARATOR);
}

export type WelcomeHeader = {
  clientId: string;
  version: PROTOCOL_VERSION;
  features: (keyof typeof FEATURE)[];
};

export function decodeServerHeader(headerValue: string | null | undefined): WelcomeHeader | undefined {
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

    const features: (keyof typeof FEATURE)[] = [];
    for (const [feature, bit] of FEATURE_MAP) {
      if (hasFlag(Number(flags), bit)) features.push(feature);
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
