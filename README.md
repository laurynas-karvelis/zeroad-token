# Introduction

This NPM module is designed for sites running Node.js, Bun, or Deno that participate in the [Zero Ad Network](https://zeroad.network) program.

The `@zeroad.network/token` module is a lightweight, TypeScript-ready, open-source, and fully tested HTTP-header-based "access/entitlement token" library with no production dependencies.

For detailed guides and implementation instructions, see the [official Zero Ad Network documentation](https://docs.zeroad.network).

## Runtime Compatibility

| Runtime | Version | ESM | CJS |
| :------ | :------ | :-: | :-: |
| Node.js | 16+     | ✅  | ✅  |
| Bun     | 1.1.0+  | ✅  | ✅  |
| Deno    | 2.0.0+  | ✅  | ✅  |

## Purpose

The module helps developers to:

- Inject a valid site's HTTP Response Header (**Welcome Header**) into every endpoint. Example:

  ```http
  X-Better-Web-Welcome: "AZqnKU56eIC7vCD1PPlwHg^1^3"
  ```

- Detect and parse Zero Ad Network user tokens sent via HTTP Request Header. Example:

  ```http
  X-Better-Web-Hello: "Aav2IXRoh0oKBw==.2yZfC2/pM9DWfgX+von4IgWLmN9t67HJHLiee/gx4+pFIHHurwkC3PCHT1Kaz0yUhx3crUaxST+XLlRtJYacAQ=="
  ```

- Verify token integrity locally.
- Optionally generate a valid "Welcome Header" when `siteId` and `features` are provided.

## Implementation Details

- Uses `node:crypto` to verify token signatures with Zero Ad Network's public ED25519 key.
- Decodes token payload to extract protocol version, expiration timestamp, and site features.
- Generates a feature map; expired tokens produce all flags as `false`.

Parsed token example:

```js
{
  ADS_OFF: boolean,
  COOKIE_CONSENT_OFF: boolean,
  MARKETING_DIALOG_OFF: boolean,
  CONTENT_PAYWALL_OFF: boolean,
  SUBSCRIPTION_ACCESS_ON: boolean,
};
```

- Verification occurs locally; no data leaves your server.
- Parsing and verification adds roughly 0.06ms–0.6ms to endpoint execution time (tested on M1 MacBook Pro). Performance may vary.
- Redis caching tests show local verification is faster than retrieving cached results.

## Benefits of Joining

Partnering with Zero Ad Network allows your site to:

- Generate a new revenue stream
- Provide a clean, unobstructed user experience
- Contribute to a more joyful, user-friendly internet

## Onboarding Your Site

1. [Sign up](https://zeroad.network/login) with Zero Ad Network.
2. [Register your site](https://zeroad.network/publisher/sites/add) to receive your unique `X-Better-Web-Welcome` header.

Your site must include this header on all publicly accessible HTML or RESTful endpoints so that Zero Ad Network users’ browser extensions can recognize participation.

## Module Installation

- Written entirely in TypeScript with full types and interfaces.
- Supports both ESM (`import`) and CommonJS (`require`). ESM is recommended when possible.

To install the module use your favourite package manager:

```shell
# npm
npm add @zeroad.network/token

# or yarn
yarn add @zeroad.network/token

# or pnpm
pnpm add @zeroad.network/token

# or Bun
bun add @zeroad.network/token

# or Deno
deno add npm:@zeroad.network/token
```

## Examples

For more example implementations using `Express.js` (JavaScript), `Hono`, and `Fastify` (TypeScript), visit the [examples section on our GitHub repository](https://github.com/laurynas-karvelis/zeroad-token-typescript/tree/main/examples/).

The following JavaScript example provides a quick reference, demonstrating how to:

- Inject the "Welcome Header" into responses
- Parse the user's token from the request header
- Use the `tokenContext` in controllers and templates

Minimal Express.js v5 app example:

```js
import express from "express";
import { Site } from "@zeroad.network/token";

const app = express();

// Initialize the Zero Ad Network module at app startup.
// The "Welcome Header" value is obtained during site registration on the Zero Ad Network platform (https://zeroad.network).
const ZERO_AD_NETWORK_WELCOME_HEADER_VALUE = "AZqnKU56eIC7vCD1PPlwHg^1^3";
const site = Site(ZERO_AD_NETWORK_WELCOME_HEADER_VALUE);

app
  // Apply middleware for all routes
  .use((req, res, next) => {
    // Inject the "X-Better-Web-Welcome" header into the response
    res.set(site.SERVER_HEADER_NAME, site.SERVER_HEADER_VALUE);

    // Parse the incoming user token from the request header
    // Attach the parsed token data to the request object for downstream use
    req.tokenContext = site.parseToken(req.get(site.CLIENT_HEADER_NAME));

    next();
  })
  .get("/", (req, res) => {
    // Access parsed token data for this request
    console.log(req.tokenContext);

    // Example structure of tokenContext:
    req.tokenContext = {
      // If true: Hide advertisements on the page
      ADS_OFF: boolean,
      // If true: Hide Cookie Consent screens and opt out non-functional trackers
      COOKIE_CONSENT_OFF: boolean,
      // If true: Hide marketing dialogs or popups (e.g., newsletter, promotions)
      MARKETING_DIALOG_OFF: boolean,
      // If true: Provide automatic access to paywalled content
      CONTENT_PAYWALL_OFF: boolean,
      // If true: Provide access to site features behind SaaS subscription (at least basic plan)
      SUBSCRIPTION_ACCESS_ON: boolean,
    };

    // Adjust content in your templates based on tokenContext values
    res.render("index.ejs", { tokenContext });
  });

const port = 3000;

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
```
