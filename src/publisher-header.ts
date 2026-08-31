import { PROTOCOL_VERSION, PUBLISHER_ID_SCHEME } from "./constants"

/**
 * The `Better-Web-Publisher` response header.
 *
 * The value is the publisher ID and nothing else, plus a version parameter in the usual HTTP style:
 *
 * ```
 *   Better-Web-Publisher: ZERO_AD:PUB_ID:7Fq2xR9nKd...; v=1
 * ```
 *
 * The publisher ID is what credits the visit for revenue sharing. The version costs six characters and
 * buys the ability to ship a second token format later without every extension having to probe for
 * support - a decoder that predates a version simply ignores the sites announcing it. Bare values with
 * no parameter are accepted and read as version 1, so a publisher who hardcodes just the ID in an nginx
 * `add_header` still works.
 */

/**
 * A publisher ID is the scheme prefix followed by alphanumerics, kept within 128 chars so it survives
 * any header/query transport. The scheme is required, which is what lets a content scan reject stray
 * page text that happens to look id-shaped.
 */
const VALID_PUBLISHER_ID = new RegExp(`^${PUBLISHER_ID_SCHEME}[A-Za-z0-9]{1,113}$`)

export function encodePublisherHeader(publisherId: string, version: number = PROTOCOL_VERSION): string {
  if (!VALID_PUBLISHER_ID.test(publisherId)) {
    throw new Error(`\`publisherId\` must be "${PUBLISHER_ID_SCHEME}" followed by 1-113 alphanumerics`)
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
