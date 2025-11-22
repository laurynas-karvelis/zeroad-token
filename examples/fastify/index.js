import Fastify from "fastify";
import {
  init,
  getServerHeaderName,
  getServerHeaderValue,
  getClientHeaderName,
  processRequest,
} from "@zeroad.network/token";

// -----------------------------------------------------------------------------
// Module initialization (done once on startup)
// -----------------------------------------------------------------------------
init({ value: process.env.ZERO_AD_NETWORK_WELCOME_HEADER_VALUE || "" });

// Pre-read server-side values
const SERVER_HEADER_NAME = getServerHeaderName();
const SERVER_HEADER_VALUE = getServerHeaderValue();
const CLIENT_HEADER_NAME = getClientHeaderName();

// -----------------------------------------------------------------------------
// Fastify app
// -----------------------------------------------------------------------------
const app = Fastify();

// -----------------------------------------------------------------------------
// Middleware (Fastify hook)
// -----------------------------------------------------------------------------
app.addHook("onRequest", async (request, reply) => {
  // Inject server header into every response
  reply.header(SERVER_HEADER_NAME, SERVER_HEADER_VALUE);

  // Read incoming client token header value
  const clientHeaderValue = request.headers[CLIENT_HEADER_NAME.toLowerCase()];

  // Process request token
  const tokenContext = processRequest(clientHeaderValue);

  // Attach token context to request for downstream usage
  request.tokenContext = tokenContext;
});

// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------
app.get("/", async (request) => {
  return {
    message: "OK",
    tokenContext: request.tokenContext,
  };
});

app.get("/template", async (request, reply) => {
  const tokenContext = request.tokenContext;

  const template = `
    <html>
      <body>
        <h1>Hello</h1>
        <pre>tokenContext = ${JSON.stringify(tokenContext, null, 2)}</pre>
        ${tokenContext.shouldRemoveAds ? "<p>Will not show ads</p>" : "<p>Will show ads</p>"}
      </body>
    </html>
  `;

  reply.type("text/html").send(template);
});

// -----------------------------------------------------------------------------
// Start server
// -----------------------------------------------------------------------------
app.listen({ port: 3000 }, () => console.log(`Fastify server listening at 3000`));
