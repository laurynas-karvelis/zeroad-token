import { PROTOCOL_VERSION } from "./constants"

let warningsSuppressed = false

/**
 * Silences (or re-enables) the future-version warning. Handy when a site expects to see newer tokens
 * for a while - during a staged rollout, say - or in tests that deliberately feed unsupported versions.
 */
export function suppressProtocolWarnings(suppressed = true): void {
  warningsSuppressed = suppressed
}

/**
 * A token whose version is newer than this module understands means the Zero Ad Network has moved to a
 * token format this build predates. The token is rejected either way - a format we do not know is
 * unreadable - but the maintainer needs to know an upgrade is due, so we say so. Older or matching
 * versions are none of this function's business.
 */
export function warnIfProtocolAhead(version: number): void {
  if (warningsSuppressed || version <= PROTOCOL_VERSION) return

  console.warn(
    `[zeroad-token] Received a token using protocol version ${version}, but this module only understands ` +
      `version ${PROTOCOL_VERSION}, so the token was rejected. The Zero Ad Network has moved to a newer ` +
      "token format - upgrade @zeroad.network/token to keep admitting subscribers on the new version."
  )
}
