import path from "node:path";
import { Eta } from "eta";
import { Context, Hono, Next } from "hono";
import { Site, FEATURES } from "@zeroad.network/token";

/**
 * Module initialization (once at startup)
 */

const site = Site({
  // Pass in `clientId` you received registering your site on Zero Ad Network platform
  clientId: "DEMO-Z2CclA8oXIT1e0Qmq",
  // Specify supported site features only
  features: [FEATURES.CLEAN_WEB, FEATURES.ONE_PASS],
});

// -----------------------------------------------------------------------------
// Hono app setup
// -----------------------------------------------------------------------------
type TokenContext = ReturnType<typeof site.parseClientToken>;
const app = new Hono<{ Variables: { tokenContext: TokenContext } }>();
const eta = new Eta({ views: path.join(import.meta.dirname, "../templates") });

// -----------------------------------------------------------------------------
// Middleware
// -----------------------------------------------------------------------------
app.use("*", async (c: Context, next: Next) => {
  // Inject the "X-Better-Web-Welcome" server header into every response
  c.header(site.SERVER_HEADER_NAME, site.SERVER_HEADER_VALUE);

  // Parse the incoming user token from the client header
  const tokenContext = site.parseClientToken(c.req.header(site.CLIENT_HEADER_NAME));

  // Attach parsed token data to request for downstream use
  c.set("tokenContext", tokenContext);

  await next();
});

// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------
app.get("/", (c) => {
  // Access parsed `tokenContext` for this request
  return c.html(eta.render("./homepage", { tokenContext: c.get("tokenContext") }));
});

app.get("/json", (c) => {
  // Return JSON response with `tokenContext` for API usage
  return c.json({
    message: "OK",
    tokenContext: c.get("tokenContext"),
  });
});

// -----------------------------------------------------------------------------
// Start Hono server (for Bun.js)
// -----------------------------------------------------------------------------
const port = 8080;
Bun.serve({ fetch: app.fetch, port });

// eslint-disable-next-line no-console
console.log(`Express server listening at port ${port}:
    · HTML site homepage:           http://localhost:${port}
    · JSON output of tokenContext:  http://localhost:${port}/token`);
