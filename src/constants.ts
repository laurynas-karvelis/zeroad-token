/**
 * Official Zero Ad Network authority public key, in base64 SPKI DER (Ed25519).
 *
 * Every token a browser extension sends is anchored to this key. Publishers verify against a local
 * copy of it and never call the platform during request handling - verification is 100% offline.
 */
export const AUTHORITY_PUBLIC_KEY: string = "MCowBQYDK2VwAyEAignXRaTQtxEDl4ThULucKNQKEEO2Lo5bEO8qKwjSDVs="

/**
 * Response header a publisher sets on every page, announcing that this site participates in the
 * network. The value is the publisher ID, which is how the platform credits the site for the visit.
 */
export const PUBLISHER_HEADER = "Better-Web-Publisher"

/**
 * Every publisher ID is namespaced with this scheme, e.g. `ZERO_AD:PUB_ID:7Fq2xR9nKd...`. The prefix
 * makes the id self-describing and lets a content-scanning extension tell a real id from arbitrary
 * page text, so a stray string in a comment can't be mistaken for a publisher id.
 */
export const PUBLISHER_ID_SCHEME = "ZERO_AD:PUB_ID:"

/**
 * Request header the browser extension attaches, carrying the visitor's subscription token.
 * Header names are case-insensitive on the wire; most frameworks expose them lowercased.
 */
export const TOKEN_HEADER = "Better-Web-Token"

/** Lowercased `TOKEN_HEADER`, which is the form Node, Bun, Deno and Hono hand you on `req.headers`. */
export const TOKEN_HEADER_LOWERCASE = "better-web-token"

/** Wire format version. Bumped only for a breaking change to the token byte layout. */
export const PROTOCOL_VERSION = 1

/**
 * Subscription plans. Only `FREEDOM` exists today - it entitles the visitor to an ad-free, tracker-free,
 * consent-dialog-free page and to any content the site keeps behind a paywall.
 *
 * The plan travels as a single byte, so 254 more can be added without a format change. Treat an
 * unrecognised plan as "not entitled" rather than as an error.
 */
export const PLAN = {
  FREEDOM: 1,
} as const

export type Plan = (typeof PLAN)[keyof typeof PLAN]

/** Human-readable plan names, for logs and dashboards. */
export const PLAN_NAME: Readonly<Record<Plan, string>> = Object.freeze({
  [PLAN.FREEDOM]: "Freedom",
})
