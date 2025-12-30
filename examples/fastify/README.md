# Fastify Example (TypeScript)

This demo shows how to integrate the `@zeroad.network/token` module with Fastify using TypeScript, async token parsing, and shared Eta templates.

## Features

- ✅ **TypeScript** - Full type safety with interface extensions
- ✅ **Async token parsing** - Non-blocking crypto operations using Node.js libuv threadpool
- ✅ **Shared Eta templates** - Reusable template in `../templates/homepage.eta`
- ✅ **Fastify hooks** - Clean middleware pattern with `onRequest` hook
- ✅ **Conditional rendering** - Ads, paywalls, and tracking based on subscription status
- ✅ **Cache configuration** - Built-in token caching for performance

## Quick Start

### 1. Install Dependencies

**Using Bun (Recommended for TypeScript):**

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

### Site Initialization

```typescript
import { Site, FEATURE, type TokenContext } from "@zeroad.network/token";

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

### Type Extension

```typescript
declare module "fastify" {
  interface FastifyRequest {
    tokenContext: TokenContext;
  }
}
```

### Fastify Hook

```typescript
fastify.addHook("onRequest", async (request, reply) => {
  // Set Welcome Header
  reply.header(site.SERVER_HEADER_NAME, site.SERVER_HEADER_VALUE);

  // Parse token (async)
  request.tokenContext = await site.parseClientToken(request.headers[site.CLIENT_HEADER_NAME]);
});
```

### Route Handler

```typescript
fastify.get("/", async (request, reply) => {
  return reply.view("homepage", {
    tokenContext: request.tokenContext,
  });
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

- **Async crypto operations** - Non-blocking signature verification
- **Token caching** - 80-95% performance improvement for repeated tokens
- **Libuv threadpool** - ~8000 verifications/sec without blocking event loop
- **Fastify performance** - One of the fastest Node.js frameworks
- **Typical overhead** - ~150μs per token parse (cache miss), ~10μs (cache hit)

## Routes

- `GET /` - Homepage with conditional ads and features
- `GET /api/premium-data` - Premium API endpoint (requires subscription)

## TypeScript Benefits

- ✅ Full type inference for `tokenContext`
- ✅ Compile-time error checking
- ✅ IDE autocomplete for all token flags
- ✅ Type-safe route handlers
- ✅ Interface extensions for Fastify

## Runtime Support

This example works with:

- **Node.js** 16+ (with TypeScript transpiler)
- **Bun** 1.1.0+ (native TypeScript support - recommended)
- **Deno** 2.0.0+ (native TypeScript support)

## Learn More

- **Documentation**: [https://docs.zeroad.network](https://docs.zeroad.network)
- **Register Your Site**: [https://zeroad.network/publisher/sites/add](https://zeroad.network/publisher/sites/add)
- **Platform**: [https://zeroad.network](https://zeroad.network)
- **Contact**: See [https://zeroad.network/terms](https://zeroad.network/terms)
