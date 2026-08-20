import { CURRENT_PROTOCOL_VERSION, FEATURE, PROTOCOL_VERSION } from "../constants"
import { assert, FEATURE_MAP, hasFlag, setFlags } from "../helpers"
import { log } from "../logger"

const SEPARATOR = "^"

const validFeatureValues = Object.values(FEATURE).filter((key) => !Number.isNaN(Number(key))) as FEATURE[]
const validFeatureKeys = Object.values(FEATURE).filter((key) => Number.isNaN(Number(key))) as FEATURE[]

export function encodeServerHeader(clientId: string, features: FEATURE[]) {
  if (!clientId?.length) {
    throw new Error("The provided `clientId` value cannot be an empty string")
  }

  if (!features?.length) {
    throw new Error("At least one site feature must be provided")
  }

  if (features.filter((feature) => validFeatureValues.includes(feature)).length !== features.length) {
    throw new Error(`Only valid site features are allowed: ${validFeatureKeys.join(" | ")}`)
  }

  return [clientId, CURRENT_PROTOCOL_VERSION, setFlags(features)].join(SEPARATOR)
}

export type WelcomeHeader = {
  clientId: string
  version: PROTOCOL_VERSION
  features: (keyof typeof FEATURE)[]
}

export function decodeServerHeader(headerValue: string | null | undefined): WelcomeHeader | undefined {
  if (!headerValue?.length) return

  try {
    const parts = headerValue.split(SEPARATOR)
    assert(parts.length === 3, "Invalid header value format")

    const [clientId, protocolVersion, flags] = parts
    assert(clientId.length > 0, "Invalid header value format")
    assert(Object.values(PROTOCOL_VERSION).includes(Number(protocolVersion)), "Invalid or unsupported protocol version")

    const flagsNumber = Number(flags)

    // `Number("-1").toFixed(0)` round-trips, so a negative value would pass the format check and then
    // light up every feature bit, and `Number("Infinity")` round-trips too - both are rejected here
    assert(Number.isSafeInteger(flagsNumber) && flagsNumber >= 0, "Invalid flags number")
    assert(flagsNumber.toFixed(0) === flags, "Invalid flags number")

    const features: (keyof typeof FEATURE)[] = []
    for (const [feature, bit] of FEATURE_MAP) {
      if (hasFlag(flagsNumber, bit)) features.push(feature)
    }

    return {
      version: Number(protocolVersion),
      clientId,
      features,
    }
  } catch (err) {
    log("warn", "Could not decode server header value", {
      reason: (err as Error)?.message,
    })
  }
}
