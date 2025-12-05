import { describe, expect, test } from "bun:test";
import { Site } from "../site";
import { setLogLevel } from "../logger";
import { encodeServerHeader, decodeServerHeader } from "../headers/server";
import { parseClientToken, encodeClientHeader, decodeClientHeader } from "../headers/client";
import * as module from "../index";

describe("module", () => {
  test("exports expected module elements", () => {
    expect(module.Site).toBe(Site);
    expect(module.setLogLevel).toBe(setLogLevel);

    expect(module.encodeClientHeader).toBe(encodeClientHeader);
    expect(module.decodeClientHeader).toBe(decodeClientHeader);
    expect(module.parseClientToken).toBe(parseClientToken);

    expect(module.encodeServerHeader).toBe(encodeServerHeader);
    expect(module.decodeServerHeader).toBe(decodeServerHeader);
  });
});
