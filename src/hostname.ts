/**
 * Hostname canonicalisation.
 *
 * The extension binds a token to the hostname exactly as it appears in the address bar, lowercased and
 * without the port. A publisher gets the same string back from `req.headers.host`, `c.req.header("host")`
 * or `new URL(request.url).hostname` depending on the stack, in varying shapes, so both sides normalise
 * the same way before the hostname is fed to a signature.
 *
 * Note what is deliberately *not* normalised here: `www.example.com` stays distinct from
 * `example.com`. A token is bound to whichever of the two the visitor had in the address bar, and the
 * signature is verified against that exact string - collapsing them here would make a token bound to
 * one verify against the other. The convenience of not having to list both hosts is handled one level
 * up, on the whitelist (see `wwwVariants`), where it changes only which hosts are admitted, never what
 * a signature is checked against.
 */
export function canonicalHostname(hostname: string): string {
  let value = hostname.trim().toLowerCase()

  // `https://example.com/path` -> `example.com`, so a publisher can pass a URL or an origin without
  // having to remember which one this function wanted
  const schemeEnd = value.indexOf("://")
  if (schemeEnd !== -1) value = value.slice(schemeEnd + 3)

  const pathStart = value.indexOf("/")
  if (pathStart !== -1) value = value.slice(0, pathStart)

  if (value.startsWith("[")) {
    // IPv6 literal: `[::1]:8080` -> `::1`
    const close = value.indexOf("]")
    if (close !== -1) return value.slice(1, close)
  }

  const portStart = value.lastIndexOf(":")
  if (portStart !== -1 && value.indexOf(":") === portStart) value = value.slice(0, portStart)

  // A fully qualified `example.com.` addresses the same host as `example.com`
  if (value.endsWith(".")) value = value.slice(0, -1)

  return value
}

/**
 * A host paired with its `www.` sibling: `example.com` -> `["example.com", "www.example.com"]`, and
 * `www.example.com` -> `["www.example.com", "example.com"]`.
 *
 * Publishers routinely serve both the apex and its `www` and reasonably expect listing one to cover the
 * other - forgetting the second is a common way to lock real subscribers out. Since the two are the
 * same registrable domain under the same owner, the whitelist admits both when either is configured.
 * This affects membership only: the token is still verified against the exact host the request arrived
 * on, so a token bound to `www.example.com` is admitted on `www.example.com` and nowhere else.
 */
export function wwwVariants(hostname: string): string[] {
  if (hostname.startsWith("www.")) return [hostname, hostname.slice(4)]
  return [hostname, `www.${hostname}`]
}
