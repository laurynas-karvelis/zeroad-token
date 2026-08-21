/* eslint-disable no-console */
import path from "node:path";
import { createPublisher } from "@zeroad.network/token";
import { Eta } from "eta";
import Fastify from "fastify";
const fastify = Fastify({ logger: false });
const eta = new Eta({ views: path.join(import.meta.dirname, "../templates") });
// Create once at startup, reuse for the life of the process
const publisher = createPublisher({
    publisherId: process.env.ZERO_AD_PUBLISHER_ID || "pub_DEMO7Fq2xR9nKd",
    hostnames: process.env.ZERO_AD_HOSTNAMES?.split(",") || ["localhost", "example.com"],
});
fastify.addHook("onRequest", async (request, reply) => {
    // Announce that this site takes part, and who to credit for the visit
    reply.header(...publisher.header);
    // Verify the visitor's token against the host they asked for
    request.visitor = await publisher.verify(request.headers[publisher.tokenHeaderNameLowercase], request.headers.host);
});
fastify.get("/", async (request, reply) => {
    const { visitor } = request;
    return reply.type("text/html").send(eta.render("homepage", {
        subscriber: visitor.subscriber,
        plan: visitor.subscriber ? visitor.planName : null,
        reason: visitor.subscriber ? null : visitor.reason,
    }));
});
fastify.get("/api/premium-data", async (request, reply) => {
    const { visitor } = request;
    if (!visitor.subscriber) {
        // `reason` is for your logs and for debugging an integration - do not leak it to visitors in
        // production, it tells an attacker exactly which check they failed
        return reply.code(403).send({ error: "Subscription required", reason: visitor.reason });
    }
    return { data: "Premium content, unlocked for a Zero Ad Network subscriber" };
});
fastify.get("/internal/token-cache", async () => publisher.cacheStats());
const PORT = Number(process.env.PORT) || 8080;
await fastify.listen({ port: PORT, host: "0.0.0.0" });
console.log(`Zero Ad Network Fastify example on http://localhost:${PORT}`);
console.log(`Announcing: ${publisher.headerName}: ${publisher.headerValue}`);
