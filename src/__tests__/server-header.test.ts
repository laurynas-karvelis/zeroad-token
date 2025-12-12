import { randomUUID } from "crypto";
import { describe, test, expect, beforeEach } from "bun:test";
import { FEATURES } from "../constants";
import { decodeServerHeader, encodeServerHeader } from "../headers/server";

describe("Server Header", () => {
  let clientId: string;

  beforeEach(() => {
    clientId = randomUUID();
  });

  describe("decodeServerHeader()", () => {
    test("should parse when a valid welcome header", () => {
      expect(decodeServerHeader(`${clientId}^1^3`)).toEqual({
        features: ["CLEAN_WEB", "ONE_PASS"],
        version: 1,
        clientId,
      });
    });

    test("should parse a when zero features are provided", () => {
      expect(decodeServerHeader(`${clientId}^1^0`)).toEqual({
        features: [],
        version: 1,
        clientId,
      });
    });

    test("should parse as undefined on an invalid header value", () => {
      expect(decodeServerHeader("")).toBeUndefined();
      expect(decodeServerHeader(null as never)).toBeUndefined();
      expect(decodeServerHeader(undefined as never)).toBeUndefined();
      expect(decodeServerHeader("1^1")).toBeUndefined();
      expect(decodeServerHeader("ZBhyPJ1VS5W5zrxNvf/IEg^0^1")).toBeUndefined();
      expect(decodeServerHeader("ZBhyPJ1VS5W5zrxNvf/IEg^1^1.1")).toBeUndefined();
      expect(decodeServerHeader("ZBhyPJ1VS5W5zrxNvf/IEg^1.1^1")).toBeUndefined();
    });
  });

  describe("encodeServerHeader()", () => {
    test("should throw when no features are provided", () => {
      expect(() => encodeServerHeader("", [FEATURES.CLEAN_WEB])).toThrow(
        /The provided `clientId` value cannot be an empty string/
      );
    });

    test("should throw when no features are provided", () => {
      expect(() => encodeServerHeader(clientId, [])).toThrow(/At least one site feature must be provided/);
    });

    test("should throw when no unsupported site features are provided", () => {
      expect(() =>
        encodeServerHeader(clientId, ["not a real feature", FEATURES.CLEAN_WEB, "should fail"] as never)
      ).toThrow(/Only valid site features are allowed: CLEAN_WEB | ONE_PASS/);
    });
  });
});
