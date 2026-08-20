import { describe, expect, test } from "bun:test"
import { randomBytes } from "node:crypto"
import { FEATURE } from "../constants"
import { assert, FEATURE_MAP, fromBase64, hasFlag, setFlags, toBase64 } from "../helpers"

describe("Helpers", () => {
  describe("base64", () => {
    test("should round-trip arbitrary byte values", () => {
      const allByteValues = new Uint8Array(256)
      for (let index = 0; index < 256; index++) allByteValues[index] = index

      expect(fromBase64(toBase64(allByteValues))).toEqual(allByteValues)
    })

    test("should round-trip every length that lands on a different padding", () => {
      for (let length = 0; length <= 8; length++) {
        const bytes = new Uint8Array(randomBytes(length))
        expect(fromBase64(toBase64(bytes))).toEqual(bytes)
      }
    })

    test("should round-trip a payload larger than the typical token", () => {
      const bytes = new Uint8Array(randomBytes(64 * 1024))
      expect(fromBase64(toBase64(bytes))).toEqual(bytes)
    })

    test("should produce standard alphabet base64", () => {
      expect(toBase64(new Uint8Array([255, 254, 253]))).toBe("//79")
      expect(toBase64(new Uint8Array([1]))).toBe("AQ==")
      expect(toBase64(new Uint8Array())).toBe("")
    })

    test("should decode a section of a larger buffer correctly", () => {
      // `fromBase64` results are handed to signature verification as `.buffer`, which would read the
      // whole underlying buffer if the returned view were ever offset into a pooled allocation
      const decoded = fromBase64(toBase64(new Uint8Array([1, 2, 3])))

      expect(decoded.byteOffset).toBe(0)
      expect(decoded.buffer.byteLength).toBe(decoded.byteLength)
    })
  })

  describe("flags", () => {
    test("should combine features into a single bitmask", () => {
      expect(setFlags([])).toBe(0)
      expect(setFlags()).toBe(0)
      expect(setFlags([FEATURE.CLEAN_WEB])).toBe(1)
      expect(setFlags([FEATURE.ONE_PASS])).toBe(2)
      expect(setFlags([FEATURE.CLEAN_WEB, FEATURE.ONE_PASS])).toBe(3)
      expect(setFlags([FEATURE.CLEAN_WEB, FEATURE.CLEAN_WEB])).toBe(1)
    })

    test("should test individual bits against a mask", () => {
      expect(hasFlag(FEATURE.CLEAN_WEB, 3)).toBe(true)
      expect(hasFlag(FEATURE.ONE_PASS, 3)).toBe(true)
      expect(hasFlag(FEATURE.ONE_PASS, 1)).toBe(false)
      expect(hasFlag(FEATURE.CLEAN_WEB, 0)).toBe(false)
    })
  })

  describe("FEATURE_MAP", () => {
    test("should hold only the named entries of the numeric enum", () => {
      expect([...FEATURE_MAP.entries()]).toEqual([
        ["CLEAN_WEB", FEATURE.CLEAN_WEB],
        ["ONE_PASS", FEATURE.ONE_PASS],
      ])
    })

    test("should give every feature a distinct single bit", () => {
      const bits = [...FEATURE_MAP.values()]

      expect(new Set(bits).size).toBe(bits.length)
      for (const bit of bits) expect(bit & (bit - 1)).toBe(0)
    })
  })

  describe("assert()", () => {
    test("should throw only on a falsy value", () => {
      expect(() => assert(true, "message")).not.toThrow()
      expect(() => assert(1, "message")).not.toThrow()
      expect(() => assert("value", "message")).not.toThrow()

      for (const falsy of [false, 0, "", null, undefined, Number.NaN]) {
        expect(() => assert(falsy, "boom")).toThrow(/boom/)
      }
    })
  })
})
