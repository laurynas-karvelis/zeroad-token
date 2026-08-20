import { beforeEach, describe, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { FEATURE } from "../constants"
import { decodeServerHeader, encodeServerHeader } from "../headers/server"

describe("Server Header", () => {
  let clientId: string

  beforeEach(() => {
    clientId = randomUUID()
  })

  describe("decodeServerHeader()", () => {
    test("should parse when a valid welcome header", () => {
      expect(decodeServerHeader(`${clientId}^1^3`)).toEqual({
        features: ["CLEAN_WEB", "ONE_PASS"],
        version: 1,
        clientId,
      })
    })

    test("should parse a when zero features are provided", () => {
      expect(decodeServerHeader(`${clientId}^1^0`)).toEqual({
        features: [],
        version: 1,
        clientId,
      })
    })

    test("should parse as undefined on an invalid header value", () => {
      expect(decodeServerHeader("")).toBeUndefined()
      expect(decodeServerHeader(null as never)).toBeUndefined()
      expect(decodeServerHeader(undefined as never)).toBeUndefined()
      expect(decodeServerHeader("1^1")).toBeUndefined()
      expect(decodeServerHeader("ZBhyPJ1VS5W5zrxNvf/IEg^0^1")).toBeUndefined()
      expect(decodeServerHeader("ZBhyPJ1VS5W5zrxNvf/IEg^1^1.1")).toBeUndefined()
      expect(decodeServerHeader("ZBhyPJ1VS5W5zrxNvf/IEg^1.1^1")).toBeUndefined()
    })

    test("should parse as undefined when the flags value is negative", () => {
      // `Number("-1").toFixed(0)` round-trips, and `-1 & bit` is truthy for every bit, so a negative
      // value would otherwise hand out every feature the SDK knows about
      expect(decodeServerHeader(`${clientId}^1^-1`)).toBeUndefined()
      expect(decodeServerHeader(`${clientId}^1^-3`)).toBeUndefined()
    })

    test("should parse as undefined when the flags value is not a finite integer", () => {
      expect(decodeServerHeader(`${clientId}^1^Infinity`)).toBeUndefined()
      expect(decodeServerHeader(`${clientId}^1^-Infinity`)).toBeUndefined()
      expect(decodeServerHeader(`${clientId}^1^NaN`)).toBeUndefined()
      expect(decodeServerHeader(`${clientId}^1^`)).toBeUndefined()
      expect(decodeServerHeader(`${clientId}^1^ 3`)).toBeUndefined()
      expect(decodeServerHeader(`${clientId}^1^3 `)).toBeUndefined()
      expect(decodeServerHeader(`${clientId}^1^0x3`)).toBeUndefined()
      expect(decodeServerHeader(`${clientId}^1^1e21`)).toBeUndefined()
      expect(decodeServerHeader(`${clientId}^1^99999999999999999999`)).toBeUndefined()
    })

    test("should parse as undefined when the clientId is empty", () => {
      // `encodeServerHeader()` refuses to produce one, so decoding must not accept it either
      expect(decodeServerHeader("^1^3")).toBeUndefined()
    })

    test("should parse as undefined when the separator count is wrong", () => {
      expect(decodeServerHeader(`${clientId}^1^3^extra`)).toBeUndefined()
      expect(decodeServerHeader(`${clientId}^^1^3`)).toBeUndefined()
      expect(decodeServerHeader(clientId)).toBeUndefined()
    })

    test("should ignore unknown feature bits rather than reject the header", () => {
      // Forward compatibility: a newer site advertising a feature this SDK version predates
      expect(decodeServerHeader(`${clientId}^1^5`)).toEqual({
        features: ["CLEAN_WEB"],
        version: 1,
        clientId,
      })

      expect(decodeServerHeader(`${clientId}^1^4294967295`)).toEqual({
        features: ["CLEAN_WEB", "ONE_PASS"],
        version: 1,
        clientId,
      })
    })
  })

  describe("encodeServerHeader()", () => {
    test("should throw when no features are provided", () => {
      expect(() => encodeServerHeader("", [FEATURE.CLEAN_WEB])).toThrow(
        /The provided `clientId` value cannot be an empty string/
      )
    })

    test("should throw when no features are provided", () => {
      expect(() => encodeServerHeader(clientId, [])).toThrow(/At least one site feature must be provided/)
    })

    test("should throw when no unsupported site features are provided", () => {
      expect(() =>
        encodeServerHeader(clientId, ["not a real feature", FEATURE.CLEAN_WEB, "should fail"] as never)
      ).toThrow(/Only valid site features are allowed: CLEAN_WEB | ONE_PASS/)
    })

    test("should throw when a nullish clientId or feature list is provided", () => {
      expect(() => encodeServerHeader(null as never, [FEATURE.CLEAN_WEB])).toThrow(
        /The provided `clientId` value cannot be an empty string/
      )
      expect(() => encodeServerHeader(clientId, null as never)).toThrow(/At least one site feature must be provided/)
      expect(() => encodeServerHeader(clientId, undefined as never)).toThrow(
        /At least one site feature must be provided/
      )
    })

    test("should collapse duplicate features into a single flag", () => {
      expect(encodeServerHeader(clientId, [FEATURE.CLEAN_WEB, FEATURE.CLEAN_WEB])).toBe(`${clientId}^1^1`)
    })

    test("should round-trip every feature combination through decodeServerHeader()", () => {
      const combinations: FEATURE[][] = [[FEATURE.CLEAN_WEB], [FEATURE.ONE_PASS], [FEATURE.CLEAN_WEB, FEATURE.ONE_PASS]]

      for (const features of combinations) {
        const decoded = decodeServerHeader(encodeServerHeader(clientId, features))

        expect(decoded?.clientId).toBe(clientId)
        expect(decoded?.version).toBe(1)
        expect(decoded?.features.length).toBe(features.length)
      }
    })
  })
})
