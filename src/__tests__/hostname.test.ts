import { describe, expect, test } from "bun:test"
import { canonicalHostname } from "../hostname"

describe("canonicalHostname", () => {
  test.each([
    ["example.com", "example.com"],
    ["EXAMPLE.COM", "example.com"],
    ["  example.com  ", "example.com"],
    ["example.com.", "example.com"],
    ["example.com:8080", "example.com"],
    ["https://example.com", "example.com"],
    ["http://example.com:3000/blog?a=1", "example.com"],
    ["example.com/blog", "example.com"],
    ["HTTPS://Example.COM:443/", "example.com"],
    ["sub.deep.example.co.uk", "sub.deep.example.co.uk"],
    ["localhost:3000", "localhost"],
    ["127.0.0.1:8080", "127.0.0.1"],
    ["[::1]:8080", "::1"],
    ["[2001:db8::1]", "2001:db8::1"],
    ["", ""],
  ])("%p -> %p", (input, expected) => {
    expect(canonicalHostname(input)).toBe(expected)
  })

  test("is idempotent", () => {
    for (const input of ["https://Example.com:8080/x", "example.com.", "[::1]:1"]) {
      const once = canonicalHostname(input)
      expect(canonicalHostname(once)).toBe(once)
    }
  })

  test("keeps www distinct from the apex domain", () => {
    expect(canonicalHostname("www.example.com")).not.toBe(canonicalHostname("example.com"))
  })
})
