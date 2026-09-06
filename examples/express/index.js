/* eslint-disable no-console */
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createPublisher, REJECTED } from "@zeroad.network/token"
import { Eta } from "eta"
import express from "express"

const app = express()
const eta = new Eta({
  views: path.join(path.dirname(fileURLToPath(import.meta.url)), "../templates"),
})

// Create once at startup, reuse for the life of the process
const publisher = createPublisher({
  publisherId: process.env.ZERO_AD_PUBLISHER_ID || "zapub_DEMOxR9nKd3wV8mB4tL6yH1c",
  hostnames: process.env.ZERO_AD_HOSTNAMES?.split(",") || ["localhost", "example.com"],
})

// One middleware does both halves of the protocol
app.use(async (request, response, next) => {
  // Announce that this site takes part, and who to credit for the visit
  response.set(...publisher.header)

  // Verify the visitor's token against the host they asked for
  response.locals.visitor = await publisher.verify(request.get(publisher.tokenHeaderName), request.get("host"))

  next()
})

app.get("/", (request, response) => {
  const { visitor } = response.locals

  response.send(
    eta.render("homepage", {
      subscriber: visitor.subscriber,
      plan: visitor.subscriber ? visitor.planName : null,
      reason: visitor.subscriber ? null : visitor.reason,
    })
  )
})

app.get("/api/premium-data", (request, response) => {
  const { visitor } = response.locals

  if (!visitor.subscriber) {
    // `reason` is for your logs and for debugging an integration - do not leak it to visitors in
    // production, it tells an attacker exactly which check they failed
    return response.status(403).json({ error: "Subscription required", reason: visitor.reason })
  }

  response.json({
    data: "Premium content, unlocked for a Zero Ad Network subscriber",
  })
})

// Worth watching in production: wrong_hostname in volume means somebody is replaying tokens
app.get("/internal/token-cache", (request, response) => {
  response.json({
    cache: publisher.cacheStats(),
    rejectionReasons: Object.values(REJECTED),
  })
})

const PORT = Number(process.env.PORT) || 8080

app.listen(PORT, () => {
  console.log(`Zero Ad Network Express example on http://localhost:${PORT}`)
  console.log(`Announcing: ${publisher.headerName}: ${publisher.headerValue}`)
})
