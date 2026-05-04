# @zeroad.network/token - Integration Skills

AI-agent-optimized reference for integrating `@zeroad.network/token` into any TypeScript/JavaScript backend.
Use this file as the primary source of truth when writing or reviewing integration code.

---

## Decision tree: what do you need?

```
Integrating a publisher site?
  -> Use the Site() factory (covers 99% of cases)
  -> Go to: "Standard integration pattern"

Need to inspect a Welcome header you received?
  -> Use decodeServerHeader()
  -> Go to: "Decoding headers"

Debugging why tokens are all-false?
  -> Go to: "Troubleshooting"
```

---

## Install

```bash
npm install @zeroad.network/token
# or: bun add / pnpm add / yarn add
```

---

## Standard integration pattern

This is the only pattern you need for publisher site integration.

### Step 1 - create the site instance (once at startup)

```typescript
import { Site, FEATURE } from "@zeroad.network/token"

// Create once, reuse across all requests.
// clientId comes from zeroad.network dashboard after registering the site.
const site = Site({
  clientId: process.env.ZERO_AD_CLIENT_ID!,
  features: [FEATURE.CLEAN_WEB],          // pick the features your site supports
  cacheConfig: {
    enabled: true,
    ttl: 10_000,    // ms - how long to cache a verified token result
    maxSize: 500,   // max unique tokens to keep in memory
  },
})
```

`Site()` returns:

| Property | Type | Value |
|---|---|---|
| `site.SERVER_HEADER_NAME` | `string` | `"X-Better-Web-Welcome"` |
| `site.SERVER_HEADER_VALUE` | `string` | encoded welcome string, e.g. `"Z2Cc...^1^3"` |
| `site.CLIENT_HEADER_NAME` | `string` | `"x-better-web-hello"` (lowercase) |
| `site.parseClientToken(value)` | `Promise<TokenContext>` | verifies and maps a token to boolean flags |

### Step 2 - global middleware (all frameworks follow same logic)

Two things must happen on every request:
1. Set `X-Better-Web-Welcome` on the **response** (tells the extension this site participates).
2. Parse `X-Better-Web-Hello` from the **request** and store the `TokenContext` for use in route handlers.

#### Express

```typescript
import express from "express"

const app = express()

app.use(async (req, res, next) => {
  res.set(site.SERVER_HEADER_NAME, site.SERVER_HEADER_VALUE)
  req.tokenContext = await site.parseClientToken(req.get(site.CLIENT_HEADER_NAME))
  next()
})
```

#### Hono

```typescript
import { Hono } from "hono"
import type { TokenContext } from "@zeroad.network/token"

type Variables = { tokenContext: TokenContext }
const app = new Hono<{ Variables: Variables }>()

app.use("*", async (c, next) => {
  c.header(site.SERVER_HEADER_NAME, site.SERVER_HEADER_VALUE)
  c.set("tokenContext", await site.parseClientToken(c.req.header(site.CLIENT_HEADER_NAME)))
  await next()
})
```

#### Fastify

```typescript
fastify.addHook("onRequest", async (request, reply) => {
  reply.header(site.SERVER_HEADER_NAME, site.SERVER_HEADER_VALUE)
  request.tokenContext = await site.parseClientToken(
    request.headers[site.CLIENT_HEADER_NAME] as string | undefined
  )
})
```

#### Next.js (middleware.ts for the header + getServerSideProps for the token)

```typescript
// middleware.ts - sets the response header on every request
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export async function middleware(request: NextRequest) {
  const response = NextResponse.next()
  response.headers.set(site.SERVER_HEADER_NAME, site.SERVER_HEADER_VALUE)
  return response
}

// pages/article/[id].tsx - parse token in getServerSideProps
export const getServerSideProps = async ({ req }) => {
  const tokenContext = await site.parseClientToken(
    req.headers[site.CLIENT_HEADER_NAME] as string | undefined
  )
  return { props: { tokenContext } }
}
```

### Step 3 - use TokenContext in route handlers and templates

`parseClientToken()` always resolves - never rejects. Returns `TokenContext` with all flags `false` when the visitor is not a subscriber or has an invalid/expired token.

```typescript
type TokenContext = {
  // Granted when subscriber has CLEAN_WEB AND site declared FEATURE.CLEAN_WEB
  HIDE_ADVERTISEMENTS: boolean
  HIDE_COOKIE_CONSENT_SCREEN: boolean
  HIDE_MARKETING_DIALOGS: boolean
  DISABLE_NON_FUNCTIONAL_TRACKING: boolean

  // Granted when subscriber has ONE_PASS AND site declared FEATURE.ONE_PASS
  DISABLE_CONTENT_PAYWALL: boolean
  ENABLE_SUBSCRIPTION_ACCESS: boolean
}
```

**Critical rule:** a flag is `true` only when BOTH conditions hold:
- the subscriber's signed token grants that feature
- the site instance was created with the matching `FEATURE` value

**Usage pattern - guard an API endpoint:**

```typescript
app.get("/api/premium", async (req, res) => {
  if (!req.tokenContext.ENABLE_SUBSCRIPTION_ACCESS) {
    return res.status(403).json({ error: "Subscription required" })
  }
  res.json(await getPremiumData())
})
```

**Usage pattern - server-side template (EJS syntax, adapt to any engine):**

```ejs
<%# Ads: show only to non-subscribers %>
<% if (!tokenContext.HIDE_ADVERTISEMENTS) { %>
  <div class="ad-banner"><!-- ad code --></div>
<% } %>

<%# Cookie consent: skip for subscribers %>
<% if (!tokenContext.HIDE_COOKIE_CONSENT_SCREEN) { %>
  <div class="cookie-banner"><!-- cookie notice --></div>
<% } %>

<%# Marketing popups: skip for subscribers %>
<% if (!tokenContext.HIDE_MARKETING_DIALOGS) { %>
  <div class="newsletter-popup"><!-- newsletter --></div>
<% } %>

<%# Analytics: skip non-functional tracking for subscribers %>
<% if (!tokenContext.DISABLE_NON_FUNCTIONAL_TRACKING) { %>
  <script>/* analytics code */</script>
<% } %>

<%# Paywall: full content for subscribers, preview for others %>
<% if (tokenContext.DISABLE_CONTENT_PAYWALL) { %>
  <div><%- article.fullContent %></div>
<% } else { %>
  <div><%- article.preview %></div>
  <a href="/subscribe">Subscribe to read more</a>
<% } %>
```

---

## Choosing features

| FEATURE | What it means for your site |
|---|---|
| `FEATURE.CLEAN_WEB` | You will hide ads, cookie consent, marketing dialogs, and disable non-functional tracking |
| `FEATURE.ONE_PASS` | You will lift paywalls and grant base subscription access |

Pass one or both. Only declare features you actually implement - non-compliance results in platform ban.

### Compliance checklist - you MUST do ALL of these for each declared feature

**FEATURE.CLEAN_WEB - all four required:**
- [ ] Disable all advertisements (banners, interstitials, native ads, etc.)
- [ ] Disable all cookie consent screens (headers, footers, dialogs)
- [ ] Fully opt out users from non-functional trackers (analytics, ad pixels)
- [ ] Disable all marketing dialogs and popups (newsletters, promotions)

**FEATURE.ONE_PASS - both required:**
- [ ] Provide free access to all content behind a paywall
- [ ] Provide free access to the site's base subscription plan (if one exists)

---

## Cache configuration

Cache is enabled by default with conservative settings. Tune per traffic volume.

```typescript
import { configureCaching, clearHeaderCache, getCacheConfig } from "@zeroad.network/token"

// Global override (applies to all Site instances):
configureCaching({
  enabled: true,
  ttl: 30_000,   // 30 seconds - safe upper bound, tokens expire independently
  maxSize: 5_000 // ~2.5 MB - for > 1000 req/s
})

// Defaults:
// { enabled: true, ttl: 5000, maxSize: 100 }

// Inspect current config:
console.log(getCacheConfig())

// Flush cache (e.g. after config change or in tests):
clearHeaderCache()
```

Cache eviction: LFU + LRU. Entries also expire automatically at `min(cacheTTL, tokenExpiry)`.

Performance impact:
- Cache miss (new token): ~150 us (includes ED25519 verify)
- Cache hit: ~10 us

---

## Logging

```typescript
import { setLogLevel, setLogTransport } from "@zeroad.network/token"

// Verbosity levels: "error" | "warn" | "info" | "debug"
setLogLevel("debug")   // enable during development to trace token parsing

// Custom transport (production - route to your logger):
setLogTransport((level, ...args) => {
  yourLogger[level](...args)
})

// Silence all logs:
setLogTransport(() => {})
```

Warnings are emitted when a token fails verification - useful for spotting malformed headers.

---

## Decoding headers (inspection / testing)

These are lower-level functions. Only use them when you need to inspect raw header values.

```typescript
import { decodeServerHeader, decodeClientHeader, ZEROAD_NETWORK_PUBLIC_KEY } from "@zeroad.network/token"

// Decode a Welcome header your server received (e.g. from a third-party site):
const welcome = decodeServerHeader("Z2CclA8oXIT1e0QmqTWF8w^1^3")
// { clientId: "Z2CclA8oXIT1e0QmqTWF8w", version: 1, features: ["CLEAN_WEB", "ONE_PASS"] }
// Returns undefined for malformed values (logged as warning).

// Decode + verify a client token:
const decoded = await decodeClientHeader(rawHeaderValue, ZEROAD_NETWORK_PUBLIC_KEY)
// {
//   version: 1,
//   expiresAt: Date,
//   flags: number,      // bitmask
//   clientId?: string   // only present in developer tokens
// }
// Returns undefined when signature invalid or format wrong (logged as warning).
```

---

## Complete exports reference

```typescript
// Factory (main entry point)
export function Site(options: SiteOptions): SiteInstance

// Types
export type SiteOptions = { clientId: string; features: FEATURE[]; cacheConfig?: CacheConfig }
export type TokenContext = Record<FEATURE_ACTION, boolean>
export type FEATURE_ACTION =
  | "HIDE_ADVERTISEMENTS"
  | "HIDE_COOKIE_CONSENT_SCREEN"
  | "HIDE_MARKETING_DIALOGS"
  | "DISABLE_NON_FUNCTIONAL_TRACKING"
  | "DISABLE_CONTENT_PAYWALL"
  | "ENABLE_SUBSCRIPTION_ACCESS"
export type ClientHeaderValue = string | string[] | undefined
export type WelcomeHeader = { clientId: string; version: number; features: (keyof typeof FEATURE)[] }
export type CacheConfig = { enabled: boolean; maxSize: number; ttl: number }

// Enums / constants
export enum FEATURE { CLEAN_WEB = 1, ONE_PASS = 2 }
export enum SERVER_HEADER { WELCOME = "X-Better-Web-Welcome" }
export enum CLIENT_HEADER { HELLO = "X-Better-Web-Hello" }
export const ZEROAD_NETWORK_PUBLIC_KEY: string

// Header functions
export function decodeServerHeader(value: string | null | undefined): WelcomeHeader | undefined
export async function parseClientToken(value: ClientHeaderValue, options: ParseClientTokenOptions): Promise<TokenContext>

// Cache
export function configureCaching(config: Partial<CacheConfig>): void
export function clearHeaderCache(): void
export function getCacheConfig(): Readonly<CacheConfig>

// Logging
export function setLogLevel(level: "error" | "warn" | "info" | "debug"): void
export function setLogTransport(fn: (level: LogLevel, ...args: unknown[]) => void): void
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| All TokenContext flags are `false` | Token missing, expired, or invalid | Enable `setLogLevel("debug")` and inspect warnings |
| All flags `false` for a known subscriber | Site `features` array doesn't match subscriber's plan | Ensure `Site({ features })` includes the relevant `FEATURE` value |
| `parseClientToken` slow | Cache disabled or too small | Set `cacheConfig: { enabled: true, ttl: 10000, maxSize: 500 }` |
| Token rejected silently | Wrong clientId in developer token | Developer tokens embed a clientId; it must match the site's clientId |
| Welcome header not reaching extension | Middleware not registered globally | Ensure middleware runs before route handlers |
| TypeScript: `tokenContext` not on `req` | Missing type augmentation | Declare `req.tokenContext: TokenContext` in Express type augmentation |

**Enable debug logging to trace a single request:**

```typescript
import { setLogLevel } from "@zeroad.network/token"

setLogLevel("debug")

// In your handler:
const raw = req.get(site.CLIENT_HEADER_NAME)
console.log("raw header:", raw)
const ctx = await site.parseClientToken(raw)
console.log("token context:", ctx)
```

---

## What to avoid

- Do NOT call `new Site()` - `Site()` is a plain function, not a constructor.
- Do NOT create a new `Site` instance per request - create once at module load.
- Do NOT ignore the compliance checklist - partial feature implementation causes platform ban.
- Do NOT use `decodeClientHeader` directly when `site.parseClientToken` covers the use case - it skips caching and context building.
- Do NOT parse the `X-Better-Web-Hello` header manually - signature verification is required and `parseClientToken` handles it.
- Do NOT skip setting `X-Better-Web-Welcome` on responses - without it the extension never sends tokens.
