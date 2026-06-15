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
});
