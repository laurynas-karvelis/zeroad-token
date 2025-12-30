import path from "node:path";
import { Hono } from "hono";
import { Eta } from "eta";
import { Site, FEATURE, type TokenContext } from "@zeroad.network/token";

// Extend Hono context type
type Variables = {
  tokenContext: TokenContext;
};

const app = new Hono<{ Variables: Variables }>();

// Initialize Eta template engine
const eta = new Eta({ views: path.join(import.meta.dirname, "../templates") });

// Initialize Zero Ad Network site instance once at startup
const site = Site({
  clientId: process.env.ZERO_AD_CLIENT_ID || "DEMO-Z2CclA8oXIT1e0Qmq",
  features: [FEATURE.CLEAN_WEB, FEATURE.ONE_PASS],
  cacheConfig: {
    enabled: true,
    ttl: 10000,
    maxSize: 500,
  },
});

// Middleware: Set Welcome Header and parse user tokens
app.use("*", async (c, next) => {
  // Set Welcome Header
  c.header(site.SERVER_HEADER_NAME, site.SERVER_HEADER_VALUE);

  // Parse token from request header
  const tokenContext = await site.parseClientToken(c.req.header(site.CLIENT_HEADER_NAME));

  c.set("tokenContext", tokenContext);

  await next();
});

// Homepage route
app.get("/", (c) => {
  const tokenContext = c.get("tokenContext");

  const html = eta.render("homepage", {
    tokenContext,
  });

  return c.html(html as string);
});

// Premium API endpoint
app.get("/api/premium-data", (c) => {
  const tokenContext = c.get("tokenContext");

  if (!tokenContext.ENABLE_SUBSCRIPTION_ACCESS) {
    return c.json(
      {
        error: "Premium subscription required",
        message: "Subscribe to Zero Ad Network to access this endpoint",
      },
      403
    );
  }

  return c.json({
    data: "Premium content for Zero Ad Network subscribers",
    timestamp: new Date().toISOString(),
  });
});

const PORT = Number(process.env.PORT) || 8080;

console.log(`
╔════════════════════════════════════════════════════════════╗
║  Zero Ad Network - Hono Example (TypeScript)               ║
╚════════════════════════════════════════════════════════════╝

Server running at: http://localhost:${PORT}

Routes:
  • GET /                  - Homepage
  • GET /api/premium-data  - Premium API endpoint

Features:
  ✓ Ultra-lightweight Hono framework
  ✓ TypeScript type safety
  ✓ Eta template rendering
  ✓ Async token parsing
  ✓ Token caching enabled

Cache Config:
  • Enabled: true
  • TTL: 10000ms
  • Max Size: 500 entries
`);

export default {
  port: PORT,
  fetch: app.fetch,
};
