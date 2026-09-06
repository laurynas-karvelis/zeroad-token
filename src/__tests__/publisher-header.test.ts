import { describe, expect, test } from "bun:test"
import { encodePublisherHeader, parsePublisherHeader } from "../publisher-header"

const PUBLISHER_ID = "zapub_7Fq2xR9nKdW3mB6tYp1sVzAe"

describe("encodePublisherHeader", () => {
  test("returns the publisher id as the bare header value", () => {
    expect(encodePublisherHeader(PUBLISHER_ID)).toBe(PUBLISHER_ID)
  })

  test.each([
    ["empty", ""],
    ["no prefix", "7Fq2xR9nKdW3mB6tYp1sVzAe"],
    ["too short", "zapub_7Fq2xR9nKd"],
    ["too long", "zapub_7Fq2xR9nKdW3mB6tYp1sVzAeXY"],
    ["a space", "zapub_7Fq2xR9nKdW3mB6tYp1sVz e"],
    ["a newline", "zapub_7Fq2xR9nKdW3mB6tYp1sVz\ne"],
    ["a header injection attempt", "zapub_7Fq2xR9nKd\r\nSet-Cookie: x=1"],
    ["a non-ASCII character", "zapub_7Fq2xR9nKdW3mB6tYp1sVzÉé"],
  ])("refuses a publisher id with %s", (_label, publisherId) => {
    expect(() => encodePublisherHeader(publisherId)).toThrow(/zapub_/)
  })
})

describe("parsePublisherHeader", () => {
  test("round-trips what encodePublisherHeader produced", () => {
    expect(parsePublisherHeader(encodePublisherHeader(PUBLISHER_ID))).toBe(PUBLISHER_ID)
  })

  test("reads a bare publisher id", () => {
    expect(parsePublisherHeader(PUBLISHER_ID)).toBe(PUBLISHER_ID)
  })

  test("tolerates whitespace and a legacy trailing parameter", () => {
    // A header still carrying the old `; v=1` parameter continues to resolve to the id
    expect(parsePublisherHeader(`  ${PUBLISHER_ID} ; v=1 `)).toBe(PUBLISHER_ID)
  })

  test.each([
    ["nothing", undefined],
    ["null", null],
    ["an empty string", ""],
    ["only a separator", ";"],
    ["a bare id with no prefix", "7Fq2xR9nKdW3mB6tYp1sVzAe"],
    ["a spaced id", "zapub_7Fq2xR9nKdW3mB6tYp1sVz e"],
    ["a re-cased id, since matching is case-sensitive", PUBLISHER_ID.toUpperCase()],
  ])("returns undefined for %s", (_label, headerValue) => {
    expect(parsePublisherHeader(headerValue)).toBeUndefined()
  })
})
