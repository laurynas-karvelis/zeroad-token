import path from "node:path";
import express from "express";
import { Eta } from "eta";
import { Site, FEATURE } from "@zeroad.network/token";

const app = express();

// Set up Eta template engine
const eta = new Eta();

app.engine("eta", buildEtaEngine());
app.set("view engine", "eta");
app.set("views", path.join(import.meta.dirname, "../templates"));

// Initialize Zero Ad Network site instance once at startup
// Get your Client ID by registering at https://zeroad.network/publisher/sites/add
const site = Site({
  clientId: process.env.ZERO_AD_CLIENT_ID || "DEMO-Z2CclA8oXIT1e0Qmq",
  features: [FEATURE.CLEAN_WEB, FEATURE.ONE_PASS],
  cacheConfig: {
    enabled: true,
    ttl: 10000, // 10 seconds
    maxSize: 500,
  },
});

// Middleware: Set Welcome Header and parse user tokens
app.use(async (req, res, next) => {
  // Tell Zero Ad Network browser extension that this site participates
  res.set(site.SERVER_HEADER_NAME, site.SERVER_HEADER_VALUE);

  // Parse the user's subscription token from request header
  req.tokenContext = await site.parseClientToken(req.get(site.CLIENT_HEADER_NAME));

  next();
});

// Homepage - Shows ads conditionally
app.get("/", async (req, res) => {
  res.render("homepage", {
    tokenContext: req.tokenContext,
  });
});

// API endpoint - Premium access only
app.get("/api/premium-data", async (req, res) => {
  // Check if user has premium access
  if (!req.tokenContext.ENABLE_SUBSCRIPTION_ACCESS) {
    return res.status(403).json({
      error: "Premium subscription required",
      message: "Subscribe to Zero Ad Network to access this endpoint",
    });
  }

  // Return premium data
  res.json({
    data: "This is premium content only available to Zero Ad Network subscribers",
    timestamp: new Date().toISOString(),
  });
});

function buildEtaEngine() {
  return (path, opts, callback) => {
    try {
      const fileContent = eta.readFile(path);
      const renderedTemplate = eta.renderString(fileContent, opts);
      callback(null, renderedTemplate);
    } catch (error) {
      callback(error);
    }
  };
}

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║  Zero Ad Network - Express.js Example                      ║
╚════════════════════════════════════════════════════════════╝

Server running at: http://localhost:${PORT}

Routes:
  • GET /                  - Homepage
  • GET /api/premium-data  - Premium API endpoint
  
Cache Config:
  • Enabled: true
  • TTL: 10000ms
  • Max Size: 500 entries
  `);
});
