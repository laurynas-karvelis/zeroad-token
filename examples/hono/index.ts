import { randomUUID } from "node:crypto";

import { Context, Hono, Next } from "hono";
import { Site, FEATURES } from "@zeroad.network/token";

/**
 * Module initialization (once at startup)
 *
 * Option 1: Provide the pre-generated "Welcome Header" value, e.g., via process.env:
 *   const site = Site(process.env.ZERO_AD_NETWORK_WELCOME_HEADER_VALUE);
 *
 * Option 2: Pass an options object to define your site's feature list:
 *   const site = Site({
 *     siteId: 'd867b6ff-cb12-4363-be54-db4cec523235',
 *     features: [FEATURES.ADS_OFF, FEATURES.COOKIE_CONSENT_OFF, FEATURES.MARKETING_DIALOG_OFF]
 *   });
 */

const site = Site({
  // For demo purposes, we'll generate a siteId UUID
  siteId: randomUUID(),
  // Specify supported site features
  features: [FEATURES.ADS_OFF, FEATURES.COOKIE_CONSENT_OFF, FEATURES.MARKETING_DIALOG_OFF],
});

// -----------------------------------------------------------------------------
// Hono app setup
// -----------------------------------------------------------------------------
type TokenContext = ReturnType<typeof site.parseToken>;
const app = new Hono<{ Variables: { tokenContext: TokenContext } }>();

// -----------------------------------------------------------------------------
// Middleware
// -----------------------------------------------------------------------------
app.use("*", async (c: Context, next: Next) => {
  // Inject "X-Better-Web-Welcome" server header into every response
  c.header(site.SERVER_HEADER_NAME, site.SERVER_HEADER_VALUE);

  // Parse incoming user token from client header
  const tokenContext = site.parseToken(c.req.header(site.CLIENT_HEADER_NAME));

  // Attach parsed token info to context for downstream usage
  c.set("tokenContext", tokenContext);

  await next();
});

// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------
app.get("/", (c) => {
  const tokenContext = c.get("tokenContext");

  // Render HTML template using tokenContext to display site feature states
  const state = (value: boolean) => (value && '<b style="background: #b0b0b067">YES</b>') || "NO";
  const template = `
    <html>
      <body>
        <h1>Hello</h1>
        <h3>Contents of "tokenContext" variable for this request:</h3>
        <pre style="display: inline-block; border: 1px solid #5b5b5ba4; padding: 0.5rem; background: #b0b0b067">tokenContext = ${JSON.stringify(tokenContext, null, 2)}</pre>

        <h3>Site Feature toggles to be used while rendering this page:</h3>
        <ul>
          <li>Skip rendering Advertisements: ${state(tokenContext.ADS_OFF)}</li>
          <li>Skip rendering Cookie Consent Dialog: ${state(tokenContext.COOKIE_CONSENT_OFF)}</li>
          <li>Skip rendering Marketing Dialog: ${state(tokenContext.MARKETING_DIALOG_OFF)}</li>
          <li>Remove Content Paywall: ${state(tokenContext.CONTENT_PAYWALL_OFF)}</li>
          <li>Provide SaaS Access to Basic Subscription Plan: ${state(tokenContext.SUBSCRIPTION_ACCESS_ON)}</li>
        </ul>
      </body>
    </html>
  `;

  return c.html(template);
});

app.get("/json", (c) => {
  // Return JSON response with tokenContext for API usage
  const tokenContext = c.get("tokenContext");
  return c.json({
    message: "OK",
    tokenContext,
  });
});

// -----------------------------------------------------------------------------
// Start server (for Bun.js)
// -----------------------------------------------------------------------------
Bun.serve({ fetch: app.fetch, port: 3000 });

console.log(`Hono server listening at port 3000
    · HTML template example:        http://localhost:3000
    · Plain JSON endpoint example:  http://localhost:3000/json`);
