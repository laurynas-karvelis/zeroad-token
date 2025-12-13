import path from "node:path";
import { Eta } from "eta";
import express from "express";
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
// Middleware
// -----------------------------------------------------------------------------
function tokenMiddleware(req, res, next) {
  // Inject the "X-Better-Web-Welcome" server header into every response
  res.setHeader(site.SERVER_HEADER_NAME, site.SERVER_HEADER_VALUE);

  // Parse the incoming user token from the client header
  // Attach parsed token data to request for downstream use
  req.tokenContext = site.parseClientToken(req.headers[site.CLIENT_HEADER_NAME]);

  next();
}

// -----------------------------------------------------------------------------
// Express app setup
// -----------------------------------------------------------------------------
const app = express();
const eta = new Eta({ views: path.join(import.meta.dirname, "../templates") });

app.use(tokenMiddleware);

app.get("/", (req, res) => {
  // Access parsed `tokenContext` for this request
  return res.send(eta.render("./homepage", { tokenContext: req.tokenContext }));
});

app.get("/token", (req, res) => {
  // Return JSON response with `tokenContext` for API usage
  res.json({
    message: "OK",
    tokenContext: req.tokenContext,
  });
});

// -----------------------------------------------------------------------------
// Start Express server
// -----------------------------------------------------------------------------
const port = 8080;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Express server listening at port ${port}:
    · HTML site homepage:           http://localhost:${port}
    · JSON output of tokenContext:  http://localhost:${port}/token`);
});
