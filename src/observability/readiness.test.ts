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
  test("ready when both mqtt and valkey are healthy", async () => {
    const result = await checkReadiness(makeMqtt(true), makeValkey(true));
    expect(result).toEqual({ ready: true, mqtt: true, valkey: true });
  });

  test("not ready when mqtt is disconnected", async () => {
    const result = await checkReadiness(makeMqtt(false), makeValkey(true));
    expect(result).toEqual({ ready: false, mqtt: false, valkey: true });
  });

  test("not ready when valkey is down", async () => {
    const result = await checkReadiness(makeMqtt(true), makeValkey(false));
    expect(result).toEqual({ ready: false, mqtt: true, valkey: false });
  });

  test("not ready when both are down", async () => {
    const result = await checkReadiness(makeMqtt(false), makeValkey(false));
    expect(result).toEqual({ ready: false, mqtt: false, valkey: false });
  });
});
