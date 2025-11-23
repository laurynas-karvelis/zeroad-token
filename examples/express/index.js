import express from "express";
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

const SERVER_HEADER_NAME = getServerHeaderName();
const SERVER_HEADER_VALUE = getServerHeaderValue();
const CLIENT_HEADER_NAME = getClientHeaderName();

// -----------------------------------------------------------------------------
// Middleware
// -----------------------------------------------------------------------------
function tokenMiddleware(req, res, next) {
  // Inject server header into every response
  res.setHeader(SERVER_HEADER_NAME, SERVER_HEADER_VALUE);

  // Read incoming client token header value
  const clientHeaderValue = req.headers[CLIENT_HEADER_NAME.toLowerCase()];

  // Process request token
  const tokenContext = processRequest(clientHeaderValue);

  // Attach processed token info to request for downstream usage
  req.tokenContext = tokenContext;

  next();
}

// -----------------------------------------------------------------------------
// Express app
// -----------------------------------------------------------------------------
const app = express();
app.use(tokenMiddleware);

app.get("/", (req, res) => {
  // req.tokenContext is available here
  res.json({
    message: "OK",
    tokenContext: req.tokenContext,
  });
});

app.get("/template", (req, res) => {
  // Example: use tokenContext to render template
  const template = `
    <html>
      <body>
        <h1>Hello</h1>
        <pre>tokenContext = ${JSON.stringify(req.tokenContext, null, 2)}</pre>
        ${req.tokenContext.shouldRemoveAds ? "<p>Will not show ads" : "<p>Will show ads</p>"}
      </body>
    </html>
  `;

  res.send(template);
});

// -----------------------------------------------------------------------------
app.listen(3000, () => {
  console.log("Server listening on port 3000");
});
