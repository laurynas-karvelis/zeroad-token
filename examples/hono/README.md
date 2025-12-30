# Hono Example (TypeScript)

This demo shows how to integrate the `@zeroad.network/token` module with Hono using TypeScript, async token parsing, and shared Eta templates.

## Features

- ✅ **Ultra-lightweight** - Hono is one of the fastest web frameworks
- ✅ **TypeScript** - Full type safety with context variables
- ✅ **Async token parsing** - Non-blocking crypto operations using Node.js libuv threadpool
- ✅ **Shared Eta templates** - Reusable template in `../templates/homepage.eta`
- ✅ **Edge-ready** - Works on Node.js, Bun, Deno, Cloudflare Workers
- ✅ **Conditional rendering** - Ads, paywalls, and tracking based on subscription status
- ✅ **Cache configuration** - Built-in token caching for performance

## Quick Start

### 1. Install Dependencies

**Using Bun (Recommended):**

```shell
bun install
```

**Using npm:**

```shell
npm install
```

### 2. Start the Server

**Using Bun:**

```shell
bun run start
```

**Using Node.js:**

```shell
node --loader ts-node/esm index.ts
# or with tsx
npx tsx index.ts
```

### 3. Open in Browser

- **Homepage**: [http://localhost:8080](http://localhost:8080)
- **Premium API**: [http://localhost:8080/api/premium-data](http://localhost:8080/api/premium-data)

## What You'll See

**Without Zero Ad Network subscription:**

- Advertisement banners
- Cookie consent dialogs
- Marketing popups
- Analytics tracking enabled
- Paywalled content (preview only)

**With Zero Ad Network subscription:**

- Clean, ad-free experience
- No cookie consent prompts
- No marketing interruptions
- Full access to paywalled content
- Privacy-protected browsing

## Testing with Demo Token

To test without purchasing a subscription:

1. **Get the Browser Extension**
   - Click "Get browser extension" in the navigation
   - Install for Chrome, Firefox, or Edge

2. **Get Demo Token**
   - Click "Get demo token" after installing
   - This opens the Zero Ad Network developer page
   - Demo token syncs automatically to your extension
   - Valid for 7 days (revisit to renew)

3. **Reload the Page**
   - The demo uses the **Freedom** plan (all features enabled)
   - You'll see the full ad-free, paywall-free experience

## How It Works

### Type Definition

```typescript
import { Site, FEATURE, type TokenContext } from "@zeroad.network/token";

type Variables = {
  tokenContext: TokenContext;
};

const app = new Hono<{ Variables: Variables }>();
```

### Site Initialization

```typescript
const site = Site({
  clientId: process.env.ZERO_AD_CLIENT_ID || "DEMO-Z2CclA8oXIT1e0Qmq",
  features: [FEATURE.CLEAN_WEB, FEATURE.ONE_PASS],
  cacheConfig: {
    enabled: true,
    ttl: 10000,
    maxSize: 500,
  },
});
```

### Middleware

```typescript
app.use("*", async (c, next) => {
  // Set Welcome Header
  c.header(site.SERVER_HEADER_NAME, site.SERVER_HEADER_VALUE);

  // Parse token (async)
  const tokenContext = await site.parseClientToken(c.req.header(site.CLIENT_HEADER_NAME));

  c.set("tokenContext", tokenContext);

  await next();
});
```

### Route Handler

```typescript
app.get("/", (c) => {
  const tokenContext = c.get("tokenContext");

  const html = eta.render("homepage", {
    tokenContext,
  });

  return c.html(html as string);
});
```

## Token Context

The `tokenContext` object contains these boolean flags:

```typescript
interface TokenContext {
  HIDE_ADVERTISEMENTS: boolean;
  HIDE_COOKIE_CONSENT_SCREEN: boolean;
  HIDE_MARKETING_DIALOGS: boolean;
  DISABLE_NON_FUNCTIONAL_TRACKING: boolean;
  DISABLE_CONTENT_PAYWALL: boolean;
  ENABLE_SUBSCRIPTION_ACCESS: boolean;
}
```

All flags are `false` for:

- Users without subscriptions
- Expired tokens
- Invalid/forged tokens

## Performance

- **Ultra-fast** - Hono is built for speed (benchmarks show 3-4x faster than Express)
- **Async crypto operations** - Non-blocking signature verification
- **Token caching** - 80-95% performance improvement for repeated tokens
- **Libuv threadpool** - ~8000 verifications/sec without blocking event loop
- **Typical overhead** - ~150μs per token parse (cache miss), ~10μs (cache hit)

## Routes

- `GET /` - Homepage with conditional ads and features
- `GET /api/premium-data` - Premium API endpoint (requires subscription)

## TypeScript Benefits

- ✅ Full type inference for `tokenContext`
- ✅ Compile-time error checking
- ✅ IDE autocomplete for all token flags
- ✅ Type-safe context variables
- ✅ Clean, modern syntax

## Runtime Support

This example works with:

- **Bun** 1.1.0+ (recommended - native TypeScript support)
- **Node.js** 16+ (with TypeScript transpiler)
- **Deno** 2.0.0+ (native TypeScript support)
- **Cloudflare Workers** (with adapter)

## Edge Deployment

Hono is designed for edge deployments. This example can be adapted for:

- Cloudflare Workers
- Deno Deploy
- Vercel Edge Functions
- AWS Lambda@Edge

## Why Hono?

- **Minimal footprint** - Small bundle size
- **Fast** - One of the fastest web frameworks
- **Modern** - Built for edge and serverless
- **Type-safe** - Full TypeScript support
- **Flexible** - Works across multiple runtimes

## Learn More

- **Documentation**: [https://docs.zeroad.network](https://docs.zeroad.network)
- **Register Your Site**: [https://zeroad.network/publisher/sites/add](https://zeroad.network/publisher/sites/add)
- **Platform**: [https://zeroad.network](https://zeroad.network)
- **Hono Docs**: [https://hono.dev](https://hono.dev)
- **Contact**: See [https://zeroad.network/terms](https://zeroad.network/terms)
