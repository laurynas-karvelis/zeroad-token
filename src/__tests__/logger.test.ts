import { afterEach, describe, expect, mock, test } from "bun:test"
import { log, setLogLevel, setLogTransport } from "../logger"

describe("Logger", () => {
  afterEach(() => {
    // Both the level and the transport are module-level singletons - restore the shipped defaults
    setLogLevel("error")
    setLogTransport((level, ...args) => console.log(`[${level.toUpperCase()}]`, ...args))
  })

  test("should suppress anything below the current level", () => {
    const transport = mock()
    setLogTransport(transport)

    log("error", "shown")
    log("warn", "hidden")
    log("info", "hidden")
    log("debug", "hidden")

    expect(transport).toHaveBeenCalledTimes(1)
    expect(transport).toHaveBeenCalledWith("error", "shown")
  })

  test("should pass every level through once raised to debug", () => {
    const transport = mock()
    setLogTransport(transport)
    setLogLevel("debug")

    log("error", "a")
    log("warn", "b")
    log("info", "c")
    log("debug", "d")

    expect(transport).toHaveBeenCalledTimes(4)
  })

  test("should forward every argument to the transport", () => {
    const transport = mock()
    setLogTransport(transport)
    setLogLevel("warn")

    log("warn", "message", { reason: "why" }, 42)

    expect(transport).toHaveBeenCalledWith("warn", "message", { reason: "why" }, 42)
  })

  test("should ignore an unknown level rather than muting the logger", () => {
    const transport = mock()
    setLogTransport(transport)
    setLogLevel("verbose" as never)

    log("error", "still shown")

    expect(transport).toHaveBeenCalledTimes(1)
  })

  test("should drop a message logged at an unknown level", () => {
    const transport = mock()
    setLogTransport(transport)
    setLogLevel("debug")

    log("trace" as never, "unknown level")

    expect(transport).not.toHaveBeenCalled()
  })
})
