import { describe, expect, test } from "bun:test";
import { loggerRedactPaths } from "./logger";

describe("logger configuration", () => {
  test("redacts known sensitive fields and nested variants", () => {
    expect(loggerRedactPaths).toEqual(expect.arrayContaining([
      "rf003.password",
      "mqtt.password",
      "password",
      "*.password",
      "*.headers.cookie",
      "*.headers.authorization",
      "*.body.key",
      "req.headers.cookie",
      "req.headers.authorization",
      "res.headers.set-cookie",
    ]));
  });
});
