# Introduction

This NPM module is meant to be used by sites participating in [Zero Ad Network](https://zeroad.network) program, that are running in either Node.js, Bun or Deno runtimes. The `@zeroad.network/token` module is a lightweight, TypeScript ready, fully open source, well tested and has no production dependencies.

You will find the official Zero Ad Network documentation at [docs.zeroad.network](https://docs.zeroad.network). Up-to-date and in depth guides, how-to's and platform implementation details can be found there.

## Runtime compatibility

| Runtime | Compatibility | ESM | CJS |
| :------ | :------------ | :-: | :-: |
| Node.js | 16+           | ✅  | ✅  |
| Bun     | 1.1.0+        | ✅  | ✅  |
| Deno    | 2.0.0+        | ✅  | ✅  |

## Purpose

It helps partnered site developer to:

- Inject a valid site's HTTP Response Header known as "Welcome Header" to every endpoint. An example:
  ```http
  X-Better-Web-Welcome: "AZqnKU56eIC7vCD1PPlwHg^1^3"
  ```
- Check for Zero Ad Network user's token presence that gets injected as a HTTP Request Header by their browser extension. An example of such Request Header:
  ```http
  X-Better-Web-Hello: "Aav2IXRoh0oKBw==.2yZfC2/pM9DWfgX+von4IgWLmN9t67HJHLiee/gx4+pFIHHurwkC3PCHT1Kaz0yUhx3crUaxST+XLlRtJYacAQ=="
  ```
- If found, parse the token from the HTTP Request Header value and verify its integrity.
- (Optionally) Generate a valid "Welcome Header" value when `siteId` UUID and site `features` array are provided.

## Implementation details

The module uses the `node:crypto` runtime module to ensure the user's Request Header payload is valid by verifying its signature for the payload using Zero Ad Network's public ED25519 cryptographic key which is supplied within the module. Then:

- User's token payload is decoded and token's protocol version, expiration timestamp and site's feature list are extracted.
- A map of the site's features and their toggle states is generated.
- An expired token will produce a feature list with all flags being set to `false`.

Parsed token result example:

```js
{
  ADS_OFF: boolean,
  COOKIE_CONSENT_OFF: boolean,
  MARKETING_DIALOG_OFF: boolean,
  CONTENT_PAYWALL_OFF: boolean,
  SUBSCRIPTION_ACCESS_ON: boolean,
};
```

User's token payload verification is done locally within your app and no data leaves your server.

When a token is present, parsing and token integrity verification will roughly add between `0.06ms` to `0.6ms` to the total endpoint execution time (as per testing done on a M1 MacBook Pro). Your mileage will vary depending on your hardware, but the impact should stay minimal.

As per our exploratory test results in attempts to cache the token and its parsed results in Redis - it takes longer to retrieve the cached result than to verify token payload integrity.

## Why to join

By partnering with Zero Ad Network your site establishes a new stream of revenue enabling you to provide a tangible and meaningful value while simultaneously providing a pure, clean and unobstructed site UI that everyone loves.

With every new site joining us, it becomes easier to reshape the internet closer to its original intention - a joyful and wonderful experience for everyone.

## Onboard your site

To register your site, [sign up](https://zeroad.network/login) with Zero Ad Network and [register your site](https://zeroad.network/publisher/sites/add). On the second step of the Site registration process you'll be provided with your unique `X-Better-Web-Welcome` header value.

If you decide for your site to participate in the Zero Ad Network program, then it must respond with this header at all times on every publicly accessible endpoint containing HTML or RESTful response. When Zero Ad Network users visit your site, this allows their browser extension to know your site is participating in the program.

## Module installation

Great news for TypeScript enjoyers, the module is written purely in TypeScript, hence all types and interfaces are readily available. The module works well in EcmaScript (`import {} from ""`) and CommonJS `const {} = require("")` environments. If unsure - prefer ESM when possible.

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

To find more example implementations for `Express.js` (JavaScript), `Hono` and `Fastify` (both TypeScript), please go to [examples section on our Github repository](https://github.com/laurynas-karvelis/zeroad-token-ts/tree/main/examples/).

Take this JavaScript example as a quick reference. The example will show how to:

- Inject the "Welcome Header" into each response;
- Parse user's token from their request header;
- Use the `tokenContext` value later in your controllers and templates.

An Express.js v.5 example of a minimal app:

```js
import express from "express";
import { Site } from "@zeroad.network/token";

const app = express();

// Initialize your Zero Ad Network module once at startup.
// "Welcome Header" value is acquired during Site's registration process at Zero Ad Network platform (see https://zeroad.network).
const ZERO_AD_NETWORK_WELCOME_HEADER_VALUE = "AZqnKU56eIC7vCD1PPlwHg^1^3";
const site = Site(ZERO_AD_NETWORK_WELCOME_HEADER_VALUE);

app
  // Your middleware
  .use((req, res, next) => {
    // Inject "X-Better-Web-Welcome" header
    res.set(site.SERVER_HEADER_NAME, site.SERVER_HEADER_VALUE);

    // Parse the request token from incoming client token header value.
    // And attach parsed info to request object for downstream usage.
    req.tokenContext = site.parseToken(req.get[site.CLIENT_HEADER_NAME]);

    next();
  })
  .get("/", (req, res) => {
    // If you would print it's contents:
    console.log(req.tokenContext);

    // This will produce:
    req.tokenContext = {
      // If set to true: Render no advertisements anywhere on the page
      ADS_OFF: boolean,
      // If set to true: Render no Cookie Consent screens (headers, footers or dialogs) on the page with complete OPT-OUT for non-functional trackers
      COOKIE_CONSENT_OFF: boolean,
      // If set to true: Render no marketing dialogs or popups such as newsletter, promotion etc. on the page
      MARKETING_DIALOG_OFF: boolean,
      // If set to true: Provide automatic access to otherwise paywalled content such as articles, news etc.
      CONTENT_PAYWALL_OFF: boolean,
      // If set to true: Provide automatic access to site features provided behind a SaaS at least the basic subscription plan
      SUBSCRIPTION_ACCESS_ON: boolean,
    };

    // In your template adjust your content depending on tokenContext values
    res.render("index.ejs", { tokenContext });
  });

const port = 3000;

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
```
