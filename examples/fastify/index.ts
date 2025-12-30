import path from "node:path";
import Fastify from "fastify";
import fastifyView from "@fastify/view";
import { Eta } from "eta";
import { Site, FEATURE, type TokenContext } from "@zeroad.network/token";

const fastify = Fastify({
  logger: true,
});

// Register Eta view engine
await fastify.register(fastifyView, {
  engine: {
    eta: new Eta({ views: path.join(import.meta.dirname, "../templates") }),
  },
  root: "../templates",
});

// Extend Fastify request type
declare module "fastify" {
  interface FastifyRequest {
    tokenContext: TokenContext;
  }
}

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

// Hook: Set Welcome Header and parse user tokens
fastify.addHook("onRequest", async (request, reply) => {
  // Set Welcome Header
  reply.header(site.SERVER_HEADER_NAME, site.SERVER_HEADER_VALUE);

  // Parse token from request header
  request.tokenContext = await site.parseClientToken(request.headers[site.CLIENT_HEADER_NAME]);
});

// Homepage route
fastify.get("/", async (request, reply) => {
  return reply.view("homepage", {
    tokenContext: request.tokenContext,
  });
});

// Premium API endpoint
fastify.get("/api/premium-data", async (request, reply) => {
  if (!request.tokenContext.ENABLE_SUBSCRIPTION_ACCESS) {
    return reply.status(403).send({
      error: "Premium subscription required",
      message: "Subscribe to Zero Ad Network to access this endpoint",
    });
  }

  return {
    data: "This is premium content only available to Zero Ad Network subscribers",
    timestamp: new Date().toISOString(),
  };
});

const PORT = Number(process.env.PORT) || 8080;

try {
  await fastify.listen({ port: PORT, host: "0.0.0.0" });

  console.log(`
╔════════════════════════════════════════════════════════════╗
║  Zero Ad Network - Fastify Example (TypeScript)            ║
╚════════════════════════════════════════════════════════════╝

Server running at: http://localhost:${PORT}

Routes:
  • GET /                  - Homepage
  • GET /api/premium-data  - Premium API endpoint

Features:
  ✓ TypeScript type safety
  ✓ Async token parsing with libuv threadpool
  ✓ Token caching (10s TTL, 500 entries max)
  ✓ Eta template rendering

Cache Config:
  • Enabled: true
  • TTL: 10000ms
  • Max Size: 500 entries
  `);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
