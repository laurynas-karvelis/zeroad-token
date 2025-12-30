# @zeroad.network/token

The official TypeScript/JavaScript module for integrating websites with the [Zero Ad Network](https://zeroad.network) platform.

## What is Zero Ad Network?

Zero Ad Network is a browser-based platform that creates a better web experience for both users and content creators:

**For Users:**

- Browse without ads, trackers, cookie consent dialogs, and marketing pop-ups
- Access paywalled content across multiple sites with a single subscription
- Support content creators directly through fair revenue distribution

**For Publishers:**

- Generate revenue from users who would otherwise use ad blockers
- Provide a cleaner user experience while maintaining income
- Get paid based on actual user engagement with your content

**How It Works:**

1. Users subscribe and install the Zero Ad Network browser extension
2. The extension sends cryptographically signed tokens to partner sites
3. Partner sites verify tokens and enable premium features (ad-free, paywall-free)
4. Monthly revenue is distributed to publishers based on user engagement time

## Features

This module provides:

- ✅ **Zero dependencies** - Lightweight and secure
- ✅ **Full TypeScript support** - Complete type definitions included
- ✅ **Cryptographic verification** - ED25519 signature validation using Node.js crypto
- ✅ **Performance optimized** - Async crypto operations with intelligent caching
- ✅ **Universal runtime support** - Works with Node.js, Bun, and Deno
- ✅ **ESM & CommonJS** - Supports both module systems

## Runtime Compatibility

| Runtime | Version | ESM | CJS |
| :------ | :------ | :-: | :-: |
| Node.js | 16+     | ✅  | ✅  |
| Bun     | 1.1.0+  | ✅  | ✅  |
| Deno    | 2.0.0+  | ✅  | ✅  |

## Installation

```bash
# npm
npm install @zeroad.network/token

# yarn
yarn add @zeroad.network/token

# pnpm
pnpm add @zeroad.network/token

# bun
bun add @zeroad.network/token

# deno
deno add npm:@zeroad.network/token
```

## Quick Start

### 1. Register Your Site

Before implementing, you need to:

1. [Sign up](https://zeroad.network/login) for a Zero Ad Network account
2. [Register your site](https://zeroad.network/publisher/sites/add) to receive your unique `Client ID`

### 2. Choose Your Features

Decide which features your site will support:

- **`FEATURE.CLEAN_WEB`**: Remove ads, cookie consent screens, trackers, and marketing dialogs
- **`FEATURE.ONE_PASS`**: Provide free access to paywalled content and base subscription plans

### 3. Basic Implementation

```typescript
import express from "express";
import { Site, FEATURE } from "@zeroad.network/token";

const app = express();

// Initialize once at startup - this creates your site instance
const site = Site({
  clientId: "YOUR_CLIENT_ID_HERE",
  features: [FEATURE.CLEAN_WEB, FEATURE.ONE_PASS],
});

// Middleware: Inject Welcome Header and parse user tokens
app.use(async (req, res, next) => {
  // Tell the browser extension your site participates
  res.set(site.SERVER_HEADER_NAME, site.SERVER_HEADER_VALUE);

  // Parse the user's subscription token
  req.tokenContext = await site.parseClientToken(req.get(site.CLIENT_HEADER_NAME));

  next();
});

// Use token context in your templates
app.get("/", async (req, res) => {
  res.render("index", {
    // Pass token context to control what appears in templates
    tokenContext: req.tokenContext,
  });
});

app.listen(3000);
```

### 4. In Your Templates

```ejs
<!-- index.ejs -->
<!DOCTYPE html>
<html>
<head>
  <title>My Site</title>
</head>
<body>
  <h1>Welcome to My Site</h1>

  <!-- Only show ads to non-subscribers -->
  <% if (!tokenContext.HIDE_ADVERTISEMENTS) { %>
    <div class="advertisement">
      <!-- Ad code here -->
    </div>
  <% } %>

  <!-- Only show cookie consent to non-subscribers -->
  <% if (!tokenContext.HIDE_COOKIE_CONSENT_SCREEN) { %>
    <div class="cookie-consent">
      <!-- Cookie consent dialog -->
    </div>
  <% } %>

  <!-- Content everyone sees -->
  <article>
    <h2>Article Title</h2>

    <!-- Show preview or full content based on subscription -->
    <% if (tokenContext.DISABLE_CONTENT_PAYWALL) { %>
      <p>Full article content for Zero Ad Network subscribers...</p>
    <% } else { %>
      <p>Article preview... <a href="/subscribe">Subscribe to read more</a></p>
    <% } %>
  </article>
</body>
</html>
```

## Token Context

After parsing, the token context contains boolean flags for each feature:

```typescript
interface TokenContext {
  // CLEAN_WEB features
  HIDE_ADVERTISEMENTS: boolean;
  HIDE_COOKIE_CONSENT_SCREEN: boolean;
  HIDE_MARKETING_DIALOGS: boolean;
  DISABLE_NON_FUNCTIONAL_TRACKING: boolean;

  // ONE_PASS features
  DISABLE_CONTENT_PAYWALL: boolean;
  ENABLE_SUBSCRIPTION_ACCESS: boolean;
}
```

**Important:** All flags default to `false` for:

- Users without subscriptions
- Expired tokens
- Invalid/forged tokens
- Missing tokens

## Advanced Configuration

### Cache Configuration

The module includes intelligent caching to minimize crypto operations. Configure caching when creating your site instance:

```typescript
import { Site, FEATURE } from "@zeroad.network/token";

const site = Site({
  clientId: process.env.ZERO_AD_CLIENT_ID!,
  features: [FEATURE.CLEAN_WEB],
  cacheConfig: {
    enabled: true,
    ttl: 10000, // Cache tokens for 10 seconds
    maxSize: 500, // Store up to 500 unique tokens
  },
});
```

**Cache Behavior:**

- Automatically respects token expiration times
- Uses LFU+LRU eviction strategy
- Thread-safe for concurrent requests

For more control, you can configure caching globally:

```typescript
import { configureCaching } from "@zeroad.network/token";

// Apply to all Site instances
configureCaching({
  enabled: true,
  ttl: 5000,
  maxSize: 100,
});
```

## Security

### Token Verification

All tokens are cryptographically signed using ED25519 by Zero Ad Network:

- **Signature verification** happens locally on your server using Zero Ad Network's official public key
- **Trusted authority** - Only tokens signed by Zero Ad Network are valid
- **No external API calls** - verification is instant and offline
- **Tamper-proof** - modified tokens fail verification automatically
- **Time-limited** - expired tokens are automatically rejected

The module uses a hardcoded public key from Zero Ad Network, ensuring only legitimate subscriber tokens are accepted.

### Token Structure

Each token contains:

1. **Protocol version** - Currently v1
2. **Expiration timestamp** - Unix timestamp
3. **Feature flags** - Bitmask of enabled features
4. **Client ID** (optional) - For developer tokens
5. **Cryptographic signature** - ED25519 signature

Example token:

```
X-Better-Web-Hello: Aav2IXRoh0oKBw==.2yZfC2/pM9DWfgX+von4IgWLmN9t67HJHLiee/gx4+pFIHHurwkC3PCHT1Kaz0yUhx3crUaxST+XLlRtJYacAQ==
```

### Privacy

Tokens contain **no personally identifiable information**:

- ❌ No user IDs
- ❌ No email addresses
- ❌ No tracking data
- ✅ Only: expiration date and feature flags

## Performance

### Benchmarks

Typical performance on modern hardware (M1 MacBook Pro):

| Operation          | Time   | Notes                        |
| ------------------ | ------ | ---------------------------- |
| Parse cached token | ~10μs  | Cache hit                    |
| Parse new token    | ~150μs | Includes crypto verification |
| Verify signature   | ~100μs | ED25519 verification         |
| Build context      | ~8μs   | Feature flag processing      |

### Optimization Tips

1. **Enable caching** - 80-95% performance improvement for repeated tokens
2. **Use async operations** - Crypto runs in Node.js threadpool (non-blocking)
3. **Cache at edge** - Consider caching at CDN/proxy level
4. **Monitor cache hit rate** - Adjust TTL and size based on traffic patterns

### High-Traffic Scenarios

For sites with >1000 req/sec:

```typescript
configureCaching({
  enabled: true,
  ttl: 30000, // 30 seconds
  maxSize: 5000, // ~2.5MB memory
});
```

The async crypto operations utilize Node.js libuv threadpool (4 threads by default), allowing ~8000 verifications/sec without blocking the event loop.

## Framework Examples

### Next.js (Pages Router)

```typescript
// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Site, FEATURE } from "@zeroad.network/token";

// Create site instance once
const site = Site({
  clientId: process.env.ZERO_AD_CLIENT_ID!,
  features: [FEATURE.CLEAN_WEB, FEATURE.ONE_PASS]
});

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Add Welcome Header to response
  response.headers.set(site.SERVER_HEADER_NAME, site.SERVER_HEADER_VALUE);

  return response;
}

// pages/article/[id].tsx
import { GetServerSideProps } from "next";
import { Site, FEATURE } from "@zeroad.network/token";

const site = Site({
  clientId: process.env.ZERO_AD_CLIENT_ID!,
  features: [FEATURE.CLEAN_WEB, FEATURE.ONE_PASS]
});

export const getServerSideProps: GetServerSideProps = async ({ req }) => {
  // Parse token in server-side code
  const tokenContext = await site.parseClientToken(
    req.headers[site.CLIENT_HEADER_NAME]
  );

  const article = await getArticle();

  return {
    props: {
      article,
      tokenContext
    }
  };
};

export default function Article({ article, tokenContext }) {
  return (
    <div>
      {/* Conditionally render based on token context */}
      {!tokenContext.HIDE_ADVERTISEMENTS && (
        <div className="ad-banner">Ad content</div>
      )}

      <article>
        <h1>{article.title}</h1>
        {tokenContext.DISABLE_CONTENT_PAYWALL ? (
          <div>{article.fullContent}</div>
        ) : (
          <div>{article.preview}</div>
        )}
      </article>
    </div>
  );
}
```

### Fastify

```typescript
import Fastify from "fastify";
import { Site, FEATURE } from "@zeroad.network/token";

const fastify = Fastify();

// Create site instance once
const site = Site({
  clientId: process.env.ZERO_AD_CLIENT_ID!,
  features: [FEATURE.CLEAN_WEB],
});

fastify.addHook("onRequest", async (request, reply) => {
  reply.header(site.SERVER_HEADER_NAME, site.SERVER_HEADER_VALUE);

  request.tokenContext = await site.parseClientToken(request.headers[site.CLIENT_HEADER_NAME]);
});

fastify.get("/", async (request, reply) => {
  return reply.view("index", {
    tokenContext: request.tokenContext,
  });
});

await fastify.listen({ port: 3000 });
```

### Hono

```typescript
import { Hono } from "hono";
import { Site, FEATURE } from "@zeroad.network/token";

const app = new Hono();

// Create site instance once
const site = Site({
  clientId: process.env.ZERO_AD_CLIENT_ID!,
  features: [FEATURE.CLEAN_WEB, FEATURE.ONE_PASS],
});

app.use("*", async (c, next) => {
  c.header(site.SERVER_HEADER_NAME, site.SERVER_HEADER_VALUE);

  c.set("tokenContext", await site.parseClientToken(c.req.header(site.CLIENT_HEADER_NAME)));

  await next();
});

app.get("/", (c) => {
  return c.html(
    renderTemplate({
      tokenContext: c.get("tokenContext"),
    })
  );
});

export default app;
```

## Complete Usage Example

```typescript
import express from "express";
import { Site, FEATURE } from "@zeroad.network/token";

const app = express();

// Create your site instance once at startup
const site = Site({
  clientId: process.env.ZERO_AD_CLIENT_ID!,
  features: [FEATURE.CLEAN_WEB, FEATURE.ONE_PASS],
  cacheConfig: {
    enabled: true,
    ttl: 10000,
    maxSize: 500,
  },
});

// Global middleware
app.use(async (req, res, next) => {
  res.set(site.SERVER_HEADER_NAME, site.SERVER_HEADER_VALUE);
  req.tokenContext = await site.parseClientToken(req.get(site.CLIENT_HEADER_NAME));
  next();
});

// Homepage with ads
app.get("/", async (req, res) => {
  res.render("index", {
    tokenContext: req.tokenContext,
  });
});

// Article page with paywall
app.get("/article/:id", async (req, res) => {
  const article = await db.articles.findById(req.params.id);

  res.render("article", {
    article,
    tokenContext: req.tokenContext,
  });
});

// Premium API endpoint
app.get("/api/premium-data", async (req, res) => {
  if (!req.tokenContext.ENABLE_SUBSCRIPTION_ACCESS) {
    return res.status(403).json({
      error: "Premium subscription required",
    });
  }

  const data = await getPremiumData();
  res.json(data);
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
```

**Template Example:**

```ejs
<!-- article.ejs -->
<!DOCTYPE html>
<html>
<head>
  <title><%= article.title %></title>
</head>
<body>
  <!-- Ads only for non-subscribers -->
  <% if (!tokenContext.HIDE_ADVERTISEMENTS) { %>
    <div class="ad-banner">
      <!-- Google AdSense or other ad code -->
    </div>
  <% } %>

  <!-- Cookie consent only for non-subscribers -->
  <% if (!tokenContext.HIDE_COOKIE_CONSENT_SCREEN) { %>
    <div class="cookie-consent">
      <p>We use cookies...</p>
    </div>
  <% } %>

  <article>
    <h1><%= article.title %></h1>

    <!-- Full content for subscribers, preview for others -->
    <% if (tokenContext.DISABLE_CONTENT_PAYWALL) { %>
      <div class="full-content">
        <%- article.fullContent %>
      </div>
    <% } else { %>
      <div class="preview">
        <%- article.preview %>
        <div class="paywall">
          <p>Subscribe to read the full article</p>
          <a href="/subscribe">Subscribe Now</a>
        </div>
      </div>
    <% } %>
  </article>

  <!-- Marketing popup only for non-subscribers -->
  <% if (!tokenContext.HIDE_MARKETING_DIALOGS) { %>
    <div class="newsletter-popup">
      <p>Subscribe to our newsletter!</p>
    </div>
  <% } %>

  <!-- Analytics tracking (only functional cookies for subscribers) -->
  <% if (!tokenContext.DISABLE_NON_FUNCTIONAL_TRACKING) { %>
    <script>
      // Google Analytics or other tracking code
    </script>
  <% } %>
</body>
</html>
```

## Implementation Requirements

When implementing Zero Ad Network features, you **must** fulfill these requirements to remain in good standing:

### CLEAN_WEB Requirements

- ✅ Disable **all** advertisements on the page
- ✅ Disable **all** cookie consent screens (headers, footers, dialogs)
- ✅ Fully opt out users from **non-functional** trackers
- ✅ Disable **all** marketing dialogs or popups (newsletters, promotions)

### ONE_PASS Requirements

- ✅ Provide free access to content behind paywalls
- ✅ Provide free access to your base subscription plan (if applicable)

**⚠️ Failure to comply will result in removal from the Zero Ad Network platform.**

## Troubleshooting

### Tokens Not Working

```typescript
import { Site, setLogLevel } from "@zeroad.network/token";

// Enable debug logging
setLogLevel("debug");

const site = Site({
  clientId: process.env.ZERO_AD_CLIENT_ID!,
  features: [FEATURE.CLEAN_WEB],
});

// In your route handler
app.use(async (req, res, next) => {
  // Check if token header is being received
  const headerValue = req.get(site.CLIENT_HEADER_NAME);
  console.log("Header value:", headerValue);

  // Parse and verify
  const tokenContext = await site.parseClientToken(headerValue);
  console.log("Token context:", tokenContext);

  req.tokenContext = tokenContext;
  next();
});
```

### Cache Issues

```typescript
import { clearHeaderCache, getCacheConfig } from "@zeroad.network/token";

// Check current config
console.log(getCacheConfig());

// Clear cache if needed
clearHeaderCache();

// Disable caching for debugging
configureCaching({ enabled: false });
```

### Common Issues

1. **All flags are false** - Token is expired, invalid, or missing
2. **Performance slow** - Enable caching or increase cache size
3. **Token rejected** - Verify Client ID matches registered site
4. **Headers not sent** - Ensure middleware runs before routes

## API Reference

### `Site(options)`

Creates a site instance with helper methods. **This is the recommended way to use the module.**

```typescript
const site = Site({
  clientId: "YOUR_CLIENT_ID",
  features: [FEATURE.CLEAN_WEB],
  cacheConfig: {
    // optional
    enabled: true,
    ttl: 5000,
    maxSize: 100,
  },
});

// Returns an object with:
site.parseClientToken(headerValue); // Parse and verify tokens
site.CLIENT_HEADER_NAME; // "x-better-web-hello"
site.SERVER_HEADER_NAME; // "X-Better-Web-Welcome"
site.SERVER_HEADER_VALUE; // Your site's welcome header value
```

**Options:**

- `clientId` (string, required) - Your site's Client ID from Zero Ad Network
- `features` (FEATURE[], required) - Array of enabled features
- `cacheConfig` (CacheConfig, optional) - Cache configuration

### `configureCaching(config)`

Configure global cache settings (applies to all Site instances).

```typescript
import { configureCaching } from "@zeroad.network/token";

configureCaching({
  enabled: boolean, // Enable/disable caching
  ttl: number, // Time-to-live in milliseconds
  maxSize: number, // Maximum cache entries
});
```

### `clearHeaderCache()`

Manually clear the token cache.

```typescript
import { clearHeaderCache } from "@zeroad.network/token";

clearHeaderCache();
```

### `setLogLevel(level)`

Set logging verbosity for debugging.

```typescript
import { setLogLevel } from "@zeroad.network/token";

setLogLevel("debug"); // "error" | "warn" | "info" | "debug"
```

### `setLogTransport(fn)`

Customize where logs are sent (useful for production monitoring).

```typescript
import { setLogTransport } from "@zeroad.network/token";

// Send logs to your monitoring service
setLogTransport((level, ...args) => {
  if (level === "error") {
    yourMonitoringService.captureError(args);
  } else {
    yourLogger.log(level, ...args);
  }
});

// Example: Integrate with Winston
import winston from "winston";

const logger = winston.createLogger({
  transports: [new winston.transports.File({ filename: "zeroad.log" })],
});

setLogTransport((level, ...args) => {
  logger.log(level, args.join(" "));
});

// Example: Disable all logging in production
if (process.env.NODE_ENV === "production") {
  setLogTransport(() => {}); // No-op function
}
```

## Resources

- 📖 [Official Documentation](https://docs.zeroad.network)
- 🌐 [Zero Ad Network Platform](https://zeroad.network)
- 💻 [Example Implementations](https://github.com/laurynas-karvelis/zeroad-token-typescript/tree/main/examples/)
- 📝 [Blog](https://docs.zeroad.network/blog)

## Contributing

This module is open-source. Contributions are welcome! Please ensure:

- All tests pass
- Code follows existing style
- TypeScript types are complete
- Documentation is updated

## License

Apache License 2.0 - see LICENSE file for details

## About Zero Ad Network

Zero Ad Network is building a fairer internet where:

- Users enjoy cleaner, faster browsing
- Publishers earn sustainable revenue
- Privacy is respected by default

Join thousands of publishers creating a better web experience.

[Get Started →](https://zeroad.network/login)
