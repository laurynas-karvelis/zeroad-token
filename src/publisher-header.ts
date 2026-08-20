import { PROTOCOL_VERSION } from "./constants"

/**
 * The `Better-Web-Publisher` response header.
 *
 * The value is the publisher ID and nothing else, plus a version parameter in the usual HTTP style:
 *
 * ```
 *   Better-Web-Publisher: pub_7Fq2xR9nKd; v=1
 * ```
 *
 * The publisher ID is what credits the visit for revenue sharing. The version costs six characters and
 * buys the ability to ship a second token format later without every extension having to probe for
 * support - a decoder that predates a version simply ignores the sites announcing it. Bare values with
 * no parameter are accepted and read as version 1, so a publisher who hardcodes just the ID in an nginx
 * `add_header` still works.
 */

/** Publisher IDs are opaque, but they end up in a response header, so control characters are refused. */
const VALID_PUBLISHER_ID = /^[\x21-\x7e]{1,128}$/

export function encodePublisherHeader(publisherId: string, version: number = PROTOCOL_VERSION): string {
  if (!VALID_PUBLISHER_ID.test(publisherId)) {
    throw new Error("`publisherId` must be 1-128 printable ASCII characters with no spaces")
  }

  return `${publisherId}; v=${version}`
}

export type PublisherHeader = {
  publisherId: string
  version: number
}

/** Reads a `Better-Web-Publisher` value. Returns `undefined` if it is absent or unusable. */
export function parsePublisherHeader(headerValue: string | null | undefined): PublisherHeader | undefined {
  if (!headerValue) return undefined

  const [rawId, ...parameters] = headerValue.split(";")
  const publisherId = rawId.trim()

  if (!VALID_PUBLISHER_ID.test(publisherId)) return undefined

  let version = PROTOCOL_VERSION

  for (const parameter of parameters) {
    const [name, value] = parameter.split("=", 2)
    if (name?.trim().toLowerCase() !== "v") continue

    const parsed = Number(value?.trim())
    if (!Number.isSafeInteger(parsed) || parsed < 1) return undefined

    version = parsed
  }

  return { publisherId, version }
}
