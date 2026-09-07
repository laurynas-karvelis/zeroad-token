# @zeroad.network/token - integration reference

Source of truth for writing or reviewing integration code against `@zeroad.network/token`.
The package verifies Zero Ad Network subscriber tokens in a publisher backend. It cannot issue them.

---

## Decision tree

```
Adding Zero Ad Network to a site?
  -> createPublisher() + one middleware. That is the whole API. See "The pattern".

Every visitor comes back subscriber: false?
  -> See "Troubleshooting", start with `reason`.

Told to make verification faster?
  -> It is already cached. See "Caching". Do not hand-roll a second cache around it.

Looking for a way to sign or mint a token?
  -> Not here, by design. This package holds no private key.
```

---

## The pattern

There is one. Deviating from it is almost always a mistake.

```ts
import { createPublisher } from "@zeroad.network/token"

// Once, at startup. Never per request - it parses a key and owns the cache.
const publisher = createPublisher({
  publisherId: process.env.ZERO_AD_PUBLISHER_ID!,
  hostnames: "example.com", // covers www.example.com too; pass a string[] for other hosts
})

// Per request, in global middleware:
//   1. announce participation on the response
//   2. verify the token on the request
response.setHeader(...publisher.header)
const visitor = await publisher.verify(request.headers["better-web-token"], request.headers.host)

if (visitor.subscriber) {
  // suppress ads, trackers, consent dialogs, marketing modals; unlock paywalled content
}
```

### Express

```ts
app.use(async (request, response, next) => {
  response.set(...publisher.header)
  response.locals.visitor = await publisher.verify(request.get(publisher.tokenHeaderName), request.get("host"))
  next()
})
```

### Fastify

```ts
fastify.addHook("onRequest", async (request, reply) => {
  reply.header(...publisher.header)
  request.visitor = await publisher.verify(request.headers[publisher.tokenHeaderNameLowercase], request.headers.host)
})
```

### Hono

```ts
app.use("*", async (c, next) => {
  c.header(...publisher.header)
  c.set("visitor", await publisher.verify(c.req.header(publisher.tokenHeaderName), c.req.header("host")))
  await next()
})
```

### Next.js middleware

```ts
export async function middleware(request: NextRequest) {
  const visitor = await publisher.verify(request.headers.get("better-web-token"), request.nextUrl.hostname)

  const response = NextResponse.next()
  response.headers.set(...publisher.header)
  response.headers.set("x-zeroad-subscriber", String(visitor.subscriber))
  return response
}
```

---

## API surface

`createPublisher(options) -> Publisher`

| Option                  | Required | Default      | Notes                                                                |
| :---------------------- | :------- | :----------- | :------------------------------------------------------------------- |
| `publisherId`           | yes      | -            | `zapub_` followed by exactly 24 alphanumerics. Throws otherwise.     |
| `hostnames`             | yes      | -            | `string \| string[]`. Whitelist; an apex covers its `www`. Scheme, port and path are stripped. |
| `publicKey`             | no       | platform key | Staging and tests only.                                              |
| `clockToleranceSeconds` | no       | `60`         |                                                                      |
| `cache`                 | no       | on           | `false`, `true`, or `Partial<CacheOptions>`.                         |

`Publisher`

| Member                                        | Type                                         |
| :-------------------------------------------- | :------------------------------------------- |
| `header`                                      | `readonly [string, string]`                  |
| `headerName`, `headerValue`                   | `string`                                     |
| `tokenHeaderName`, `tokenHeaderNameLowercase` | `string`                                     |
| `verify(token, hostname?)`                    | `Promise<VerificationResult>`                |
| `cacheStats()`                                | `{ size, maxSize, hits, misses, evictions }` |
| `clearCache()`                                | `void`                                       |
| `publisherId`, `hostnames`                    | echo of the resolved config                  |

`VerificationResult` is a discriminated union on `subscriber`:

```ts
| { subscriber: true; plan: Plan; planName: string; expiresAt: Date; hostname: string; cached: boolean }
| { subscriber: false; reason: Rejected; hostname: string; cached: boolean }
```

`REJECTED`: `missing`, `malformed`, `unsupported_version`, `expired`, `unknown_hostname`,
`wrong_hostname`, `forged`.

`PLAN`: `{ FREEDOM: 1 }`. One plan exists. The field is a byte, so more can be added without a format
change - treat an unrecognised plan as not entitled rather than as an error.

Also exported: `PLAN_NAME`, `PUBLISHER_HEADER`, `PUBLISHER_ID_SCHEME`, `TOKEN_HEADER`,
`TOKEN_HEADER_LOWERCASE`, `AUTHORITY_PUBLIC_KEY`, `PROTOCOL_VERSION`, `TOKEN_BYTES`, `TOKEN_CHARACTERS`,
`DEFAULT_CACHE_OPTIONS`, `canonicalHostname()`, `encodePublisherHeader()`, `parsePublisherHeader()`,
`suppressProtocolWarnings()`.

`suppressProtocolWarnings(suppressed = true)` silences the one-off `console.warn` emitted when a token
arrives with a protocol version newer than this build understands (still rejected as
`unsupported_version`). Call it once at startup only to quiet a staged rollout or version-feeding tests
- never to paper over the real signal, which is that an upgrade is overdue.

---

## Rules

**Do**

- Create the publisher once per process, at module scope.
- Set `Better-Web-Publisher` on every response, including ones where no token arrived. It is how the
  extension discovers the site takes part.
- Pass the request's host to `verify()` when serving more than one hostname.
- Listing an apex admits its `www` sibling and vice versa, so a site serving both needs only one in
  the list. The signature is still checked against the exact host each request arrives on.
- Log `wrong_hostname` and `forged` counts. Both mean somebody is attacking, not misconfiguring.

**Do not**

- Do not call `createPublisher()` inside a request handler.
- Do not build your own cache around `verify()`. It caches successes and failures already, keyed by
  hostname and token, bounded, with successes never outliving the token.
- Do not return `reason` to the visitor in production. It tells an attacker which check they failed.
- Do not set `publicKey` in production.
- Do not treat `verify()` as throwing. Junk input yields `{ subscriber: false }`. It throws in exactly
  one case: several hostnames configured and none passed to the call.
- Do not gate anything on `expiresAt` yourself. It is already checked, with clock tolerance.
- Do not look for a signing, issuing or key-generation export. There is none.

---

## Caching

On by default: `{ enabled: true, maxSize: 1000, ttl: 600_000 }`.

- Keyed by hostname **and** token, so one host cannot answer for another.
- Successes and cryptographic failures (`forged`, `wrong_hostname`) are both cached - each costs the
  same ~80us to reach.
- Cheap rejections (`missing`, `malformed`, `expired`) are **not** cached. They cost about a
  microsecond, and caching them would let anyone flood memory with distinct keys.
- A cached success is trusted for `min(ttl, token.expiresAt)`.
- Safe to cache negatives because, for a fixed public key, a rejection never becomes an acceptance.
- Eviction is least-used-first, oldest breaking ties. Expired entries are swept every 128 writes.

Tuning: raise `maxSize` if `cacheStats()` shows `size === maxSize` with a climbing `evictions`.

---

## Wire format

174 bytes, 232 base64url characters, two Ed25519 signatures.

```
  offset  size  field
       0     1  version (1)
       1     1  plan
       2     4  expiresAt, u32 unix seconds, little-endian
       6    32  ephemeralPublicKey
      38    64  authoritySignature   over "better-web:credential:v1" || bytes[0..38)
     102     8  nonce
     110    64  hostnameSignature    over "better-web:hostname:v1" || bytes[0..110) || hostname
```

The authority signs the batch credential (bytes 0 to 37) at issuance, over an authenticated session,
after checking the subscription is live. The extension holds the matching ephemeral private key and
signs the hostname locally, offline, the first time it meets a site.

The hostname is not on the wire. The verifier rebuilds the signed message from the host it serves, so a
token bound elsewhere fails the signature rather than failing a string comparison.

`src/__tests__/__fixtures__/authority.ts` is the reference implementation of both signing steps. Other
language ports should be checked against it.

---

## Troubleshooting

| Symptom                          | Cause                                                                                  |
| :------------------------------- | :------------------------------------------------------------------------------------- |
| All `missing`                    | Normal - only subscribers send a token. Verify `Better-Web-Publisher` is on responses. |
| All `forged`                     | A `publicKey` override left over from staging.                                         |
| All `unknown_hostname`           | Host not in `hostnames`. Log `visitor.hostname` to see what arrived; check the proxy.  |
| `wrong_hostname` from real users | Rare - `www`/apex are folded. Suspect token replay, or a proxy rewriting `Host`.        |
| `unsupported_version`            | Newer token format. Upgrade the package.                                               |
| `expired` in bursts              | Server clock drift. Raise `clockToleranceSeconds`, then fix NTP.                       |
| Throws "several hostnames"       | Multiple hosts configured, none passed to `verify()`.                                  |
| Slower under load                | `cacheStats()`: working set outgrew `maxSize`.                                         |

---

## Performance

Bun 1.3, Apple Silicon, single core, measured end to end through `verify()`: cold 80us (~12,400/s),
cached 0.33us (~3,000,000/s), malformed ~1us. Uses synchronous `node:crypto` where available (36.7us per signature, against
46.0us via the threadpool and 47.3us via WebCrypto), falling back to WebCrypto on edge runtimes.

Runtimes: Node 16+, Bun 1.1+, Deno 2.0+, and edge. ESM and CJS. Zero dependencies.
