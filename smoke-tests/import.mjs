import assert from "node:assert"
import { createPublisher, PLAN, PUBLISHER_HEADER, REJECTED, TOKEN_HEADER } from "../dist/index.mjs"

const publisher = createPublisher({
  publisherId: "pub_smoke",
  hostnames: "example.com",
})

assert.equal(publisher.headerName, PUBLISHER_HEADER)
assert.equal(publisher.headerValue, "pub_smoke; v=1")
assert.equal(publisher.tokenHeaderName, TOKEN_HEADER)
assert.equal(PLAN.FREEDOM, 1)

const visitor = await publisher.verify(undefined)
assert.equal(visitor.subscriber, false)
assert.equal(visitor.reason, REJECTED.MISSING)

const junk = await publisher.verify("not-a-token")
assert.equal(junk.reason, REJECTED.MALFORMED)

console.info("ESM: passed.")
