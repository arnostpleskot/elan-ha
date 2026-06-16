import { describe, expect, test } from "bun:test";
import pino from "pino";
import { loggerRedactPaths } from "./logger";

describe("logger configuration", () => {
  test("redacts known sensitive fields and nested variants", () => {
    expect(loggerRedactPaths).toEqual(expect.arrayContaining([
      "rf003.password",
      "mqtt.password",
      "password",
      "*.password",
      "*.*.password",
      "*.*.key",
      "*.*.cookie",
      "*.*.authorization",
      "*.*.*.password",
      "*.*.*.key",
      "*.*.*.cookie",
      "*.*.*.authorization",
      "*.*.*.*.password",
      "*.*.*.*.key",
      "*.*.*.*.cookie",
      "*.*.*.*.authorization",
      "*.headers.cookie",
      "*.headers.authorization",
      "*.body.key",
      "req.headers.cookie",
      "req.headers.authorization",
      "res.headers.set-cookie",
    ]));
  });

  test("redacts deeply nested sensitive fields in log output", () => {
    const chunks: string[] = [];
    const sink = {
      write: (chunk: string) => {
        chunks.push(chunk);
      },
    };
    const logger = pino({ redact: { paths: loggerRedactPaths, censor: "[Redacted]" } }, sink);

    logger.info({
      safe: "visible",
      nested: {
        credentials: {
          password: "deep-password-secret",
          key: "deep-key-secret",
        },
        headers: {
          cookie: "deep-cookie-secret",
          authorization: "deep-authorization-secret",
        },
      },
      one: {
        two: {
          three: {
            password: "three-deep-secret",
            key: "three-deep-key",
            cookie: "three-deep-cookie",
            authorization: "Bearer three-deep",
          },
        },
      },
    });

    const output = chunks.join("");
    expect(output).toContain("visible");
    expect(output).toContain("[Redacted]");
    expect(output).not.toContain("deep-password-secret");
    expect(output).not.toContain("deep-key-secret");
    expect(output).not.toContain("deep-cookie-secret");
    expect(output).not.toContain("deep-authorization-secret");
    expect(output).not.toContain("three-deep-secret");
    expect(output).not.toContain("three-deep-key");
    expect(output).not.toContain("three-deep-cookie");
    expect(output).not.toContain("Bearer three-deep");
  });
});
