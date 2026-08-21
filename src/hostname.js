/**
 * Hostname canonicalisation.
 *
 * The extension binds a token to the hostname exactly as it appears in the address bar, lowercased and
 * without the port. A publisher gets the same string back from `req.headers.host`, `c.req.header("host")`
 * or `new URL(request.url).hostname` depending on the stack, in varying shapes, so both sides normalise
 * the same way before the hostname is fed to a signature.
 *
 * Note what is deliberately *not* normalised: `www.example.com` stays distinct from `example.com`.
 * Folding them together would let a token bound to one be accepted by the other, and a publisher that
 * genuinely serves both should list both.
 */
export function canonicalHostname(hostname) {
    let value = hostname.trim().toLowerCase();
    // `https://example.com/path` -> `example.com`, so a publisher can pass a URL or an origin without
    // having to remember which one this function wanted
    const schemeEnd = value.indexOf("://");
    if (schemeEnd !== -1)
        value = value.slice(schemeEnd + 3);
    const pathStart = value.indexOf("/");
    if (pathStart !== -1)
        value = value.slice(0, pathStart);
    if (value.startsWith("[")) {
        // IPv6 literal: `[::1]:8080` -> `::1`
        const close = value.indexOf("]");
        if (close !== -1)
            return value.slice(1, close);
    }
    const portStart = value.lastIndexOf(":");
    if (portStart !== -1 && value.indexOf(":") === portStart)
        value = value.slice(0, portStart);
    // A fully qualified `example.com.` addresses the same host as `example.com`
    if (value.endsWith("."))
        value = value.slice(0, -1);
    return value;
}
