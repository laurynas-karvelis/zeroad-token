# Express.js Example

This demo shows how to integrate the `@zeroad.network/token` module with Express.js using async token parsing and shared Eta templates.

## Features

- ✅ **Async token parsing** - Non-blocking crypto operations using Node.js libuv threadpool
- ✅ **Shared Eta templates** - Reusable template in `../templates/homepage.eta`
- ✅ **Conditional rendering** - Ads, paywalls, and tracking based on subscription status
- ✅ **Cache configuration** - Built-in token caching for performance
- ✅ **Multiple routes** - Homepage, article page, and premium API endpoint

## Quick Start

### 1. Install Dependencies

```shell
npm install
```

### 2. Start the Server

```shell
npm start
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

```javascript
import { Site, FEATURE } from "@zeroad.network/token";

const site = Site({
  clientId: "YOUR_CLIENT_ID",
  features: [FEATURE.CLEAN_WEB, FEATURE.ONE_PASS],
  cacheConfig: {
    enabled: true,
    ttl: 10000,
    maxSize: 500,
  },
});
```

### Middleware

```javascript
app.use(async (req, res, next) => {
  // Set Welcome Header
  res.set(site.SERVER_HEADER_NAME, site.SERVER_HEADER_VALUE);

  // Parse token (async)
  req.tokenContext = await site.parseClientToken(req.get(site.CLIENT_HEADER_NAME));

  next();
});
```

### Template Rendering

```javascript
app.get("/", async (req, res) => {
  res.render("homepage", {
    tokenContext: req.tokenContext,
  });
});
```

### Template Usage

The shared `templates/homepage.eta` template uses the token context:

```html
<% if (!it.tokenContext.HIDE_ADVERTISEMENTS) { %>
<div class="ad-banner">
  <!-- Ad content -->
</div>
<% } %>
```

## Token Context

The `tokenContext` object contains these boolean flags:

```javascript
{
  HIDE_ADVERTISEMENTS: boolean,
  HIDE_COOKIE_CONSENT_SCREEN: boolean,
  HIDE_MARKETING_DIALOGS: boolean,
  DISABLE_NON_FUNCTIONAL_TRACKING: boolean,
  DISABLE_CONTENT_PAYWALL: boolean,
  ENABLE_SUBSCRIPTION_ACCESS: boolean
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
- **Typical overhead** - ~150μs per token parse (cache miss), ~10μs (cache hit)

## Routes

- `GET /` - Homepage with conditional ads and features
- `GET /api/premium-data` - Premium API endpoint (requires subscription)

## Learn More

- **Documentation**: [https://docs.zeroad.network](https://docs.zeroad.network)
- **Register Your Site**: [https://zeroad.network/publisher/sites/add](https://zeroad.network/publisher/sites/add)
- **Platform**: [https://zeroad.network](https://zeroad.network)
- **Contact**: See [https://zeroad.network/terms](https://zeroad.network/terms)
