import { afterEach, describe, expect, spyOn, test } from "bun:test"
import { PROTOCOL_VERSION } from "../constants"
import { suppressProtocolWarnings, warnIfProtocolAhead } from "../version-warning"

const NEWER_VERSION = PROTOCOL_VERSION + 1

describe("future-version warning", () => {
  let warn: ReturnType<typeof spyOn>

  afterEach(() => {
    warn?.mockRestore()
    suppressProtocolWarnings(false)
  })

  test("warns when a newer protocol version arrives, so maintainers know to upgrade", () => {
    warn = spyOn(console, "warn").mockImplementation(() => {})

    warnIfProtocolAhead(NEWER_VERSION)

    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain(`protocol version ${NEWER_VERSION}`)
    expect(warn.mock.calls[0][0]).toContain("upgrade")
  })

  test("stays silent for the current or an older version", () => {
    warn = spyOn(console, "warn").mockImplementation(() => {})

    warnIfProtocolAhead(PROTOCOL_VERSION)
    warnIfProtocolAhead(PROTOCOL_VERSION - 1)

    expect(warn).not.toHaveBeenCalled()
  })

  test("stays silent once warnings are suppressed", () => {
    warn = spyOn(console, "warn").mockImplementation(() => {})

    suppressProtocolWarnings()
    warnIfProtocolAhead(NEWER_VERSION)

    expect(warn).not.toHaveBeenCalled()
  })
})
