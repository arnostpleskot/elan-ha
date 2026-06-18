import { describe, expect, test } from "bun:test";
import type { Redis } from "ioredis";
import type { MqttClient } from "mqtt";
import { checkReadiness } from "./readiness";

const makeMqtt = (connected: boolean) => ({ connected }) as unknown as MqttClient;

const makeValkey = (healthy: boolean) =>
  ({
    ping: healthy
      ? async () => "PONG"
      : async () => {
          throw new Error("connection refused");
        },
  }) as unknown as Redis;

describe("checkReadiness", () => {
  test("ready when mqtt, valkey, and RF-003 are healthy", async () => {
    const result = await checkReadiness(makeMqtt(true), makeValkey(true), async () => true);
    expect(result).toEqual({ ready: true, mqtt: true, valkey: true, rf003: true });
  });

  test("not ready when mqtt is disconnected", async () => {
    const result = await checkReadiness(makeMqtt(false), makeValkey(true), async () => true);
    expect(result).toEqual({ ready: false, mqtt: false, valkey: true, rf003: true });
  });

  test("not ready when valkey is down", async () => {
    const result = await checkReadiness(makeMqtt(true), makeValkey(false), async () => true);
    expect(result).toEqual({ ready: false, mqtt: true, valkey: false, rf003: true });
  });

  test("not ready when RF-003 check returns false", async () => {
    const result = await checkReadiness(makeMqtt(true), makeValkey(true), async () => false);
    expect(result).toEqual({ ready: false, mqtt: true, valkey: true, rf003: false });
  });

  test("not ready when RF-003 check throws", async () => {
    const result = await checkReadiness(makeMqtt(true), makeValkey(true), async () => {
      throw new Error("session expired");
    });
    expect(result).toEqual({ ready: false, mqtt: true, valkey: true, rf003: false });
  });
});
