/**
 * Reproducible microbenchmark for `publisher.verify()`, the counterpart to the PHP SDK's
 * `benchmarks/verify.php`: cold verification (two Ed25519 checks), a cached verdict (a map lookup), and
 * a malformed token (rejected on length before it is decoded).
 *
 * Run: `bun run benchmarks/verify.ts`
 */

import { createAuthority, mintToken } from "../src/__tests__/__fixtures__/authority"
import { createPublisher } from "../src/publisher"
import { TOKEN_CHARACTERS } from "../src/token"

const HOSTNAME = "example.com"
const PUBLISHER_ID = "zapub_7Fq2xR9nKdW3mB6tYp1sVzAe"

const authority = createAuthority()
const validToken = mintToken(authority, HOSTNAME)
const malformedToken = "!".repeat(TOKEN_CHARACTERS)

async function measure(
  work: () => Promise<unknown>,
  iterations: number,
  warmup = 2000,
): Promise<{ perCallUs: number; opsPerSec: number }> {
  for (let i = 0; i < warmup; i++) await work()

  const start = Bun.nanoseconds()
  for (let i = 0; i < iterations; i++) await work()
  const elapsedNs = Bun.nanoseconds() - start

  const perCallUs = elapsedNs / iterations / 1000
  return { perCallUs, opsPerSec: 1_000_000 / perCallUs }
}

function report(label: string, result: { perCallUs: number; opsPerSec: number }): void {
  const ops = Math.round(result.opsPerSec).toLocaleString("en-US")
  console.log(`${label.padEnd(32)} ${result.perCallUs.toFixed(2).padStart(8)} us   ${ops.padStart(14)} ops/s`)
}

// Cold: cache off, so every call runs the full two-signature verification.
const cold = createPublisher({
  publisherId: PUBLISHER_ID,
  hostnames: HOSTNAME,
  publicKey: authority.publicKey,
  cache: false,
})

// Cached: default cache, warmed by measure()'s warmup so every timed call is a hit.
const cached = createPublisher({
  publisherId: PUBLISHER_ID,
  hostnames: HOSTNAME,
  publicKey: authority.publicKey,
})

console.log(`Bun ${Bun.version} on ${process.arch}`)
console.log("-".repeat(68))

report("Cold verification, end to end", await measure(() => cold.verify(validToken), 100_000))
report("Cached verdict", await measure(() => cached.verify(validToken), 500_000))
report("Malformed token", await measure(() => cold.verify(malformedToken), 200_000))
