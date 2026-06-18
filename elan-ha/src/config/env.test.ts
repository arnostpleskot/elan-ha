import { describe, expect, test } from "bun:test";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  test("parses required settings and applies defaults", () => {
    const config = parseEnv({
      RF003_BASE_URL: "http://rf003.local",
      RF003_USERNAME: "admin",
      RF003_PASSWORD: "secret",
      MQTT_URL: "mqtt://mosquitto.local:1883",
      VALKEY_URL: "redis://valkey.local:6379",
    });

    expect(config.rf003.baseUrl).toBe("http://rf003.local");
    expect(config.rf003.username).toBe("admin");
    expect(config.rf003.password).toBe("secret");
    expect(config.mqtt.url).toBe("mqtt://mosquitto.local:1883");
    expect(config.mqtt.discoveryPrefix).toBe("homeassistant");
    expect(config.mqtt.baseTopic).toBe("inels");
    expect(config.valkey.url).toBe("redis://valkey.local:6379");
    expect(config.poll.fullStateIntervalMs).toBe(60_000);
    expect(config.poll.deviceStateIntervalMs).toBe(300_000);
    expect(config.http.host).toBe("0.0.0.0");
    expect(config.http.port).toBe(3000);
    expect(config.logLevel).toBe("info");
  });

  test("throws when a required setting is missing", () => {
    expect(() => parseEnv({})).toThrow("Missing required environment variable RF003_BASE_URL");
  });

  test("throws when RF003_BASE_URL is not a URL", () => {
    expect(() =>
      parseEnv({
        RF003_BASE_URL: "not-a-url",
        RF003_USERNAME: "admin",
        RF003_PASSWORD: "secret",
        MQTT_URL: "mqtt://mosquitto.local:1883",
        VALKEY_URL: "redis://valkey.local:6379",
      }),
    ).toThrow("RF003_BASE_URL must be a valid URL with protocol http: or https:");
  });

  test("throws when MQTT_URL uses an invalid protocol", () => {
    expect(() =>
      parseEnv({
        RF003_BASE_URL: "http://rf003.local",
        RF003_USERNAME: "admin",
        RF003_PASSWORD: "secret",
        MQTT_URL: "http://broker.local",
        VALKEY_URL: "redis://valkey.local:6379",
      }),
    ).toThrow("MQTT_URL must be a valid URL with protocol mqtt: or mqtts:");
  });

  test("throws when MQTT_URL does not include a hostname", () => {
    expect(() =>
      parseEnv({
        RF003_BASE_URL: "http://rf003.local",
        RF003_USERNAME: "admin",
        RF003_PASSWORD: "secret",
        MQTT_URL: "mqtt:broker",
        VALKEY_URL: "redis://valkey.local:6379",
      }),
    ).toThrow("MQTT_URL must include a hostname");
  });

  test("throws when VALKEY_URL uses an invalid protocol", () => {
    expect(() =>
      parseEnv({
        RF003_BASE_URL: "http://rf003.local",
        RF003_USERNAME: "admin",
        RF003_PASSWORD: "secret",
        MQTT_URL: "mqtt://mosquitto.local:1883",
        VALKEY_URL: "ftp://valkey.local",
      }),
    ).toThrow("VALKEY_URL must be a valid URL with protocol redis: or rediss:");
  });

  test("throws when VALKEY_URL does not include a hostname", () => {
    expect(() =>
      parseEnv({
        RF003_BASE_URL: "http://rf003.local",
        RF003_USERNAME: "admin",
        RF003_PASSWORD: "secret",
        MQTT_URL: "mqtt://mosquitto.local:1883",
        VALKEY_URL: "redis:valkey",
      }),
    ).toThrow("VALKEY_URL must include a hostname");
  });

  test("throws when a numeric setting is invalid", () => {
    expect(() =>
      parseEnv({
        RF003_BASE_URL: "http://rf003.local",
        RF003_USERNAME: "admin",
        RF003_PASSWORD: "secret",
        MQTT_URL: "mqtt://mosquitto.local:1883",
        VALKEY_URL: "redis://valkey.local:6379",
        HTTP_PORT: "invalid",
      }),
    ).toThrow("HTTP_PORT must be a valid integer");
  });

  test("throws when a numeric setting contains trailing text", () => {
    expect(() =>
      parseEnv({
        RF003_BASE_URL: "http://rf003.local",
        RF003_USERNAME: "admin",
        RF003_PASSWORD: "secret",
        MQTT_URL: "mqtt://mosquitto.local:1883",
        VALKEY_URL: "redis://valkey.local:6379",
        HTTP_PORT: "123abc",
      }),
    ).toThrow("HTTP_PORT must be a valid integer");
  });

  test("throws when a poll interval is not positive", () => {
    expect(() =>
      parseEnv({
        RF003_BASE_URL: "http://rf003.local",
        RF003_USERNAME: "admin",
        RF003_PASSWORD: "secret",
        MQTT_URL: "mqtt://mosquitto.local:1883",
        VALKEY_URL: "redis://valkey.local:6379",
        POLL_FULL_STATE_INTERVAL_MS: "0",
      }),
    ).toThrow("POLL_FULL_STATE_INTERVAL_MS must be greater than 0");
  });

  test("throws when an HTTP port is out of range", () => {
    expect(() =>
      parseEnv({
        RF003_BASE_URL: "http://rf003.local",
        RF003_USERNAME: "admin",
        RF003_PASSWORD: "secret",
        MQTT_URL: "mqtt://mosquitto.local:1883",
        VALKEY_URL: "redis://valkey.local:6379",
        HTTP_PORT: "70000",
      }),
    ).toThrow("HTTP_PORT must be between 1 and 65535");
  });

  test("accepts trace and fatal log levels", () => {
    const baseEnv = {
      RF003_BASE_URL: "http://rf003.local",
      RF003_USERNAME: "admin",
      RF003_PASSWORD: "secret",
      MQTT_URL: "mqtt://mosquitto.local:1883",
      VALKEY_URL: "redis://valkey.local:6379",
    };

    expect(parseEnv({ ...baseEnv, LOG_LEVEL: "trace" }).logLevel).toBe("trace");
    expect(parseEnv({ ...baseEnv, LOG_LEVEL: "fatal" }).logLevel).toBe("fatal");
  });

  test("rejects unsupported log levels", () => {
    expect(() =>
      parseEnv({
        RF003_BASE_URL: "http://rf003.local",
        RF003_USERNAME: "admin",
        RF003_PASSWORD: "secret",
        MQTT_URL: "mqtt://mosquitto.local:1883",
        VALKEY_URL: "redis://valkey.local:6379",
        LOG_LEVEL: "verbose",
      }),
    ).toThrow("LOG_LEVEL must be one of trace, debug, info, warn, error, fatal");
  });
});
