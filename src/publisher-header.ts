import { PUBLISHER_ID_SCHEME } from "./constants"

/**
 * The `Better-Web-Publisher` response header.
 *
 * The value is the publisher ID and nothing else:
 *
 * ```
 *   Better-Web-Publisher: zapub_7Fq2xR9nKd...
 * ```
 *
 * The same string is what goes in a `<meta name="Better-Web-Publisher">` tag and what a publisher
 * prints in page content on a platform they don't fully control - one id, one representation, so a
 * value copied from any of those places verifies against the others. The publisher ID is what credits
 * the visit for revenue sharing.
 */

/** The random part of a publisher id. Must match `PUBLISHER_ID_RANDOM_LENGTH` on the platform. */
const PUBLISHER_ID_RANDOM_LENGTH = 24

/**
 * A publisher ID is the prefix followed by exactly 24 alphanumerics, e.g.
 * `zapub_7Fq2xR9nKdW3mB6tYp1sVzAe`. The prefix is required, which is what lets a content scan reject
 * stray page text that happens to look id-shaped. Case-sensitive: the id is used verbatim wherever it
 * appears, so a re-cased copy is not the same id.
 */
const VALID_PUBLISHER_ID = new RegExp(`^${PUBLISHER_ID_SCHEME}[A-Za-z0-9]{${PUBLISHER_ID_RANDOM_LENGTH}}$`)

/** The header value for a publisher id: the id itself, once validated. Throws if it is malformed. */
export function encodePublisherHeader(publisherId: string): string {
  if (!VALID_PUBLISHER_ID.test(publisherId)) {
    throw new Error(
      `\`publisherId\` must be "${PUBLISHER_ID_SCHEME}" followed by ${PUBLISHER_ID_RANDOM_LENGTH} alphanumerics`
    )
  }

  return publisherId
}

/**
 * Reads a `Better-Web-Publisher` value and returns the publisher id, or `undefined` if it is absent or
 * unusable. Surrounding whitespace and any trailing `;`-separated parameters (which the format no
 * longer uses) are tolerated, so a header still carrying a legacy parameter continues to resolve.
 */
export function parsePublisherHeader(headerValue: string | null | undefined): string | undefined {
  if (!headerValue) return undefined

  const publisherId = headerValue.split(";")[0].trim()
  return VALID_PUBLISHER_ID.test(publisherId) ? publisherId : undefined
}
