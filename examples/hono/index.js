/* eslint-disable no-console */
import path from "node:path";
import { createPublisher } from "@zeroad.network/token";
import { Eta } from "eta";
import { Hono } from "hono";
const app = new Hono();
const eta = new Eta({ views: path.join(import.meta.dirname, "../templates") });
// Create once at startup, reuse for the life of the process
const publisher = createPublisher({
    publisherId: process.env.ZERO_AD_PUBLISHER_ID || "pub_DEMO7Fq2xR9nKd",
    hostnames: process.env.ZERO_AD_HOSTNAMES?.split(",") || ["localhost", "example.com"],
    cache: { ttl: 600_000, maxSize: 5000 },
});
app.use("*", async (c, next) => {
    // Announce that this site takes part, and who to credit for the visit
    c.header(...publisher.header);
    // Verify the visitor's token against the host they asked for
    c.set("visitor", await publisher.verify(c.req.header(publisher.tokenHeaderName), c.req.header("host")));
    await next();
});
app.get("/", (c) => {
    const visitor = c.get("visitor");
    return c.html(eta.render("homepage", {
        subscriber: visitor.subscriber,
        plan: visitor.subscriber ? visitor.planName : null,
        reason: visitor.subscriber ? null : visitor.reason,
    }));
});
app.get("/api/premium-data", (c) => {
    const visitor = c.get("visitor");
    if (!visitor.subscriber) {
        // `reason` is for your logs and for debugging an integration - do not leak it to visitors in
        // production, it tells an attacker exactly which check they failed
        return c.json({ error: "Subscription required", reason: visitor.reason }, 403);
    }
    return c.json({
        data: "Premium content, unlocked for a Zero Ad Network subscriber",
    });
});
app.get("/internal/token-cache", (c) => c.json(publisher.cacheStats()));
const PORT = Number(process.env.PORT) || 8080;
console.log(`Zero Ad Network Hono example on http://localhost:${PORT}`);
console.log(`Announcing: ${publisher.headerName}: ${publisher.headerValue}`);
export default { port: PORT, fetch: app.fetch };
