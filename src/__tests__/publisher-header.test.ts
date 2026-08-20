import { describe, expect, test } from "bun:test"
import { PROTOCOL_VERSION } from "../constants"
import { encodePublisherHeader, parsePublisherHeader } from "../publisher-header"

describe("encodePublisherHeader", () => {
  test("emits the publisher id with the current protocol version", () => {
    expect(encodePublisherHeader("pub_7Fq2xR9nKd")).toBe("pub_7Fq2xR9nKd; v=1")
  })

  test("accepts an explicit version, for forward compatibility testing", () => {
    expect(encodePublisherHeader("pub_x", 2)).toBe("pub_x; v=2")
  })

  test.each([
    ["empty", ""],
    ["a space", "pub id"],
    ["a newline", "pub\nid"],
    ["a carriage return", "pub\rid"],
    ["a header injection attempt", "pub_a\r\nSet-Cookie: session=stolen"],
    ["a non-ASCII character", "pub_é"],
    ["over 128 characters", "p".repeat(129)],
  ])("refuses a publisher id containing %s", (_label, publisherId) => {
    expect(() => encodePublisherHeader(publisherId)).toThrow(/printable ASCII/)
  })

  test("accepts exactly 128 characters", () => {
    expect(encodePublisherHeader("p".repeat(128))).toContain("p".repeat(128))
  })
})

describe("parsePublisherHeader", () => {
  test("round-trips what encodePublisherHeader produced", () => {
    expect(parsePublisherHeader(encodePublisherHeader("pub_abc"))).toEqual({
      publisherId: "pub_abc",
      version: PROTOCOL_VERSION,
    })
  })

  test("reads a bare publisher id as version 1", () => {
    // A publisher who pasted just the id into an nginx `add_header` still works
    expect(parsePublisherHeader("pub_abc")).toEqual({
      publisherId: "pub_abc",
      version: 1,
    })
  })

  test("tolerates whitespace and parameter casing", () => {
    expect(parsePublisherHeader("  pub_abc ;  V = 3 ")).toEqual({
      publisherId: "pub_abc",
      version: 3,
    })
  })

  test("ignores parameters it does not know", () => {
    expect(parsePublisherHeader("pub_abc; charset=utf-8; v=2")).toEqual({
      publisherId: "pub_abc",
      version: 2,
    })
  })

  test.each([
    ["nothing", undefined],
    ["null", null],
    ["an empty string", ""],
    ["only a separator", ";"],
    ["a spaced id", "pub id; v=1"],
    ["a zero version", "pub_abc; v=0"],
    ["a negative version", "pub_abc; v=-1"],
    ["a non-numeric version", "pub_abc; v=next"],
    ["a fractional version", "pub_abc; v=1.5"],
  ])("returns undefined for %s", (_label, headerValue) => {
    expect(parsePublisherHeader(headerValue)).toBeUndefined()
  })
})
