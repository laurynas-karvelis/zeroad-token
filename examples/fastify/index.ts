import path from "node:path";
import { Eta } from "eta";
import Fastify from "fastify";
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
// Fastify app setup
// -----------------------------------------------------------------------------
const app = Fastify();
const eta = new Eta({ views: path.join(import.meta.dirname, "../templates") });

// Extend FastifyRequest interface to include tokenContext
declare module "fastify" {
  interface FastifyRequest {
    tokenContext: ReturnType<typeof site.parseClientToken>;
  }
}

// -----------------------------------------------------------------------------
// Middleware (Fastify hook)
// -----------------------------------------------------------------------------
app.addHook("onRequest", async (request, reply) => {
  // Inject the "X-Better-Web-Welcome" server header into every response
  reply.header(site.SERVER_HEADER_NAME, site.SERVER_HEADER_VALUE);

  // Parse the incoming user token from the client header
  // Attach parsed token data to request for downstream use
  request.tokenContext = site.parseClientToken(request.headers[site.CLIENT_HEADER_NAME]);
});

// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------
app.get("/", async (request, reply) => {
  // Access parsed `tokenContext` for this request
  reply.type("text/html").send(eta.render("./homepage", { tokenContext: request.tokenContext }));
});

app.get("/json", async (request) => {
  // Return JSON response with `tokenContext` for API usage
  return {
    message: "OK",
    tokenContext: request.tokenContext,
  };
});

// -----------------------------------------------------------------------------
// Start Fastify server
// -----------------------------------------------------------------------------
const port = 8080;
app.listen({ port }, () => {
  console.log(`Express server listening at port ${port}:
    · HTML site homepage:           http://localhost:${port}
    · JSON output of tokenContext:  http://localhost:${port}/token`);
});
