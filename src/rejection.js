/**
 * Why a token was not accepted. Publishers can ignore this and just branch on `subscriber`, but it is
 * worth logging: a burst of `WRONG_HOSTNAME` means somebody is replaying tokens harvested elsewhere,
 * and any `FORGED` at all means somebody is minting them.
 */
export const REJECTED = {
    /** No token header on the request. The visitor has no extension, or is not a subscriber. */
    MISSING: "missing",
    /** Not a well-formed token: wrong length, not base64url, or a plan byte nobody recognises. */
    MALFORMED: "malformed",
    /** A token format this SDK version predates. Upgrade the package. */
    UNSUPPORTED_VERSION: "unsupported_version",
    /** Structurally sound, correctly signed, but past its expiry. */
    EXPIRED: "expired",
    /** The hostname given to `verify()` is not one this publisher was configured to serve. */
    UNKNOWN_HOSTNAME: "unknown_hostname",
    /** Genuine token, but bound to a different site. Somebody tried to replay another site's traffic. */
    WRONG_HOSTNAME: "wrong_hostname",
    /** The authority signature does not check out. The token was not issued by Zero Ad Network. */
    FORGED: "forged",
};
