# @zeroad.network/token

Verify [Zero Ad Network](https://zeroad.network) subscriber tokens in your backend. Offline, in about
80 microseconds cold and a third of a microsecond cached, with no dependencies and no calls back to us.

```bash
npm install @zeroad.network/token
```

---

## The thirty second version

Zero Ad Network subscribers pay a monthly fee and install a browser extension. When one of them visits
your site, the extension attaches a cryptographically signed token. You verify it locally, and if it
checks out you owe that visitor a clean page - no ads, no trackers, no cookie dialog, no paywall. Your
share of their subscription is paid out monthly based on the time they actually spent with you.

Two headers, and this package handles both ends:

| Direction      | Header                 | Carries                                         |
| :------------- | :--------------------- | :---------------------------------------------- |
| You -> visitor | `Better-Web-Publisher` | your publisher ID, so the visit can be credited |
| Visitor -> you | `Better-Web-Token`     | their signed, origin-bound subscription token   |

---

## Integrate

### 1. Register

[Sign up](https://zeroad.network/login), add your site, and copy your **publisher ID**.

### 2. Create a publisher, once, at startup

```ts
import { createPublisher } from "@zeroad.network/token"

export const publisher = createPublisher({
  publisherId: process.env.ZERO_AD_PUBLISHER_ID,
  hostnames: "example.com", // covers www.example.com too; pass a string[] for other hosts
})
```

`hostnames` is every host you serve. It is required, and it matters - see
[why hostnames are a whitelist](#why-hostnames-are-a-whitelist). Listing an apex covers its `www`
(and vice versa), so `["example.com"]` already admits `www.example.com`.

### 3. Wire up one middleware

```ts
app.use(async (request, response, next) => {
  response.set(...publisher.header)

  response.locals.visitor = await publisher.verify(request.get(publisher.tokenHeaderName), request.get("host"))

  next()
})
```

### 4. Branch on it

```ts
if (response.locals.visitor.subscriber) {
  // no ads, no trackers, no consent dialog, no paywall
}
```

That is the whole integration. Working examples for
[Express](./examples/express), [Fastify](./examples/fastify) and [Hono](./examples/hono) live in this
repository.

> Set `Better-Web-Publisher` even on pages where you never read a token. It is how the extension
> discovers that your site takes part at all, and how visits get attributed to you.

---

## API

### `createPublisher(options)`

| Option                  | Type                 | Default      |                                                              |
| :---------------------- | :------------------- | :----------- | :----------------------------------------------------------- |
| `publisherId`           | `string`             | -            | From your dashboard. `zapub_` followed by 24 alphanumerics.  |
| `hostnames`             | `string \| string[]` | -            | Every host you serve; an apex covers its `www`. Ports, schemes and paths are stripped. |
| `publicKey`             | `string`             | platform key | Override for staging and tests. Leave alone in production.   |
| `clockToleranceSeconds` | `number`             | `60`         | Slack on expiry, for servers whose clocks drift.             |
| `cache`                 | `boolean \| object`  | on           | See [caching](#caching).                                     |

Returns an object you keep for the life of the process:

|                                         |                                                                |
| :-------------------------------------- | :------------------------------------------------------------- |
| `publisher.header`                      | `["Better-Web-Publisher", "zapub_..."]`, ready to spread       |
| `publisher.headerName` / `.headerValue` | the same, separately                                           |
| `publisher.tokenHeaderName`             | `"Better-Web-Token"`                                           |
| `publisher.tokenHeaderNameLowercase`    | `"better-web-token"`, how Node and Fastify key request headers |
| `publisher.verify(token, hostname?)`    | `Promise<VerificationResult>`                                  |
| `publisher.cacheStats()`                | `{ size, maxSize, hits, misses, evictions }`                   |
| `publisher.clearCache()`                | drops every cached verdict                                     |

### `publisher.verify(token, hostname?)`

Takes the raw header value - `string`, `string[]` (Node hands back an array for a repeated header),
`null` or `undefined`. Never throws on bad input; a junk token is a result, not an exception.

The hostname may be omitted when exactly one was configured. Pass `request.headers.host` when you
serve several - a host outside your whitelist is rejected, never trusted.

The result is a discriminated union, so TypeScript gives you the right fields in each branch:

```ts
const visitor = await publisher.verify(token, host)

if (visitor.subscriber) {
  visitor.plan // PLAN.FREEDOM
  visitor.planName // "Freedom"
  visitor.expiresAt // Date
} else {
  visitor.reason // REJECTED.*
}

visitor.hostname // what it was verified against
visitor.cached // whether this skipped the cryptography
```

### `REJECTED`

Worth logging. Most of these are ordinary; two are not.

| Reason                | Means                                            | Ordinary?                        |
| :-------------------- | :----------------------------------------------- | :------------------------------- |
| `missing`             | No token header. Most of your traffic.           | yes                              |
| `malformed`           | Not a well-formed token.                         | yes                              |
| `unsupported_version` | A newer token format. Upgrade this package.      | yes, but see below               |
| `expired`             | Genuine, but past its expiry.                    | yes                              |
| `unknown_hostname`    | The host asked for is not in your whitelist.     | check your config                |
| `wrong_hostname`      | A genuine token minted for **a different site**. | **somebody is replaying tokens** |
| `forged`              | Not signed by Zero Ad Network.                   | **somebody is minting tokens**   |

The first time a token arrives whose version is newer than this package understands, it is rejected as
`unsupported_version` **and** a one-off `console.warn` tells you an upgrade is due - the network has
moved to a token format this build predates, and until you upgrade you will turn those subscribers
away. If you would rather not see it - during a staged rollout, or in tests that feed such tokens on
purpose - call `suppressProtocolWarnings()` once at startup.

### Also exported

`PLAN`, `PLAN_NAME`, `REJECTED`, `PUBLISHER_HEADER`, `PUBLISHER_ID_SCHEME`, `TOKEN_HEADER`,
`TOKEN_HEADER_LOWERCASE`, `AUTHORITY_PUBLIC_KEY`, `PROTOCOL_VERSION`, `TOKEN_BYTES`, `TOKEN_CHARACTERS`,
`DEFAULT_CACHE_OPTIONS`, `canonicalHostname()`, `encodePublisherHeader()`, `parsePublisherHeader()`,
`suppressProtocolWarnings()`, and the `VerificationResult`, `SubscriberResult`, `NonSubscriberResult`,
`Plan`, `Rejected`, `CacheOptions`, `CacheStats`, `Publisher`, `PublisherOptions` types.

This package **only verifies**. Nothing here can mint a token - that requires a private key that never
leaves the platform.

---

## Caching

A subscriber's token stays the same all day, so a returning visitor sends bytes you have already
checked. Verifying once and remembering the answer turns 80 microseconds of elliptic curve maths into
a 0.33 microsecond map lookup. It is on by default and there is rarely a reason to touch it.

```ts
createPublisher({
  publisherId: "zapub_...",
  hostnames: "example.com",
  cache: { ttl: 600_000, maxSize: 5000 }, // or `cache: false`
})
```

| Option    | Default  |                                   |
| :-------- | :------- | :-------------------------------- |
| `enabled` | `true`   |                                   |
| `ttl`     | `600000` | milliseconds a verdict is trusted |
| `maxSize` | `1000`   | entries, roughly 700 bytes each   |

Three things it does that are worth knowing about:

**Failures are cached too.** A forged token costs exactly as much to reject as a real one costs to
accept, and whoever sends it is likely to send it again. This is safe because, for a fixed public key,
a rejection can never later become an acceptance - the only direction a verdict moves is valid to
expired, which each entry's own expiry already handles.

**A success never outlives the token.** The stored expiry is the earlier of your TTL and the token's
own `expiresAt`, so a generous TTL cannot extend anybody's subscription.

**Cheap rejections are not cached.** A malformed token is thrown out by a length check in about a
microsecond. Caching those would save nothing and would hand anyone who can send a request an easy way
to fill your memory with distinct keys.

Entries are evicted least-used-first, with the oldest breaking ties, and expired ones are swept as
writes accumulate rather than on a timer - an idle process stays idle.

---

## How the token works

You do not need this to integrate. You may want it before you trust it.

A token is 174 bytes, 232 base64url characters, and carries **two** Ed25519 signatures.

```
  offset  size  field
       0     1  version
       1     1  plan
       2     4  expiresAt, u32 unix seconds, little-endian
       6    32  ephemeralPublicKey
      38    64  authoritySignature
     102     8  nonce
     110    64  hostnameSignature
```

**The platform signs a batch credential.** Once a day, the extension generates a batch of throwaway
keypairs locally and sends the public halves to us. We check the subscription is live, sign each one
together with the plan and an expiry truncated to midnight UTC, and send them back. We never see the
private halves, and the shared midnight expiry puts every subscriber in one anonymity set.

**The extension binds one to your hostname.** Offline, with no network call, the first time it meets
`example.com` it takes an unused keypair and signs your hostname with the private half. It reuses that
bound token for every request to you until it expires.

**You verify both signatures.** The first proves the platform issued the credential for a live
subscription. The second proves it was minted for _your_ host.

The hostname is deliberately absent from the wire. Your server already knows what it serves and
rebuilds the signed message from that, so there is nothing to parse or compare - a token bound
elsewhere simply fails the signature.

### What this stops

The token you receive contains a **public** key and a signature over **your own** hostname. The secret
that mints bindings never leaves the visitor's browser.

- You cannot present a visitor's token at another site. You would need a signature over that site's
  hostname, and you do not have the key.
- Nobody can edit the plan or push out the expiry. Both are covered by the platform signature.
- Nobody can mint a token. That needs a private key we hold.

Two properties to be aware of rather than surprised by. A token is reused for a day, so it is a stable
identifier _for your site alone_ for that long - inherent to any multi-use token, and no other site
ever sees the same one. And unlinkability from the platform itself rests on us not retaining which
account we signed which key for, which is a policy commitment, not a mathematical one.

### Why hostnames are a whitelist

`hostnames` is required, and `verify()` will not fall back to whatever arrived in the `Host` header,
because tokens are bound to a hostname and `Host` is set by the client. Without the whitelist an
attacker could bind a token to a domain they control, send it with `Host: that-domain.example`, and be
admitted as a subscriber. Listing your hosts removes the possibility.

`www.example.com` and `example.com` are technically different hosts, but listing either admits both -
they are the same domain under one owner - so a site that serves both needs only one of them in the
list. The signature is still checked against the exact host each request arrives on.

---

## Performance

Measured on Bun 1.3, Apple Silicon, single core:

|                               |                                                    |
| :---------------------------- | :------------------------------------------------- |
| Cold verification, end to end | 80us, about 12,400/s                               |
| Cached verdict                | 0.33us, about 3,000,000/s                          |
| Malformed token               | about 1us, rejected on length before it is decoded |

`node:crypto`'s synchronous verify is used where available. It is faster than dispatching to the
libuv threadpool (36.7us against 46.0us) and faster than WebCrypto (47.3us), and work that short does
not benefit from leaving the main thread. WebCrypto is the fallback, so edge runtimes work too.

---

## Runtimes

|                                        |      |               |
| :------------------------------------- | :--- | :------------ |
| Node.js                                | 16+  | ESM and CJS   |
| Bun                                    | 1.1+ | ESM and CJS   |
| Deno                                   | 2.0+ | ESM           |
| Edge (Cloudflare Workers, Vercel Edge) | -    | via WebCrypto |

---

## Troubleshooting

**Every visitor comes back `missing`.** Expected - only subscribers send a token. Confirm the pipe
works by checking `Better-Web-Publisher` appears on your responses (`curl -sI https://your-site`).

**`unknown_hostname`.** The host being verified is not in `hostnames` (the `www`/apex sibling of a
listed host counts as listed). Log `visitor.hostname` to see what actually arrived; a reverse proxy
may be passing something you did not expect.

**`wrong_hostname` from real visitors.** Should be rare - `www` and apex are folded together, so this
is not the usual `www`-versus-apex slip. A steady stream means tokens are being replayed from another
site; a trickle is usually a proxy rewriting `Host` to something the token was not bound to.

**`forged` for everybody.** A `publicKey` override left over from staging.

**It got slower under load.** Check `publisher.cacheStats()`. A high `evictions` count against `size`
at `maxSize` means the working set outgrew the cache - raise `maxSize`.

---

## License

Apache-2.0
