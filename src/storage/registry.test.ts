import { describe, expect, test } from "bun:test";
import type { DiscoveredEntity } from "../devices/types";
import { loadDeviceRegistry, saveDeviceRegistry } from "./registry";

const entity: DiscoveredEntity = {
  id: "09354",
  kind: "switch",
  name: "Strop - Chodba",
  productType: "RFSA-66M",
  rf003Type: "light",
  objectId: "inels_09354",
};

describe("device registry storage", () => {
  test("saves and loads discovered entities", async () => {
    const values = new Map<string, string>();
    const redis = {
      get: async (key: string) => values.get(key) ?? null,
      set: async (key: string, value: string) => {
        values.set(key, value);
        return "OK";
      },
    };

    await saveDeviceRegistry(redis, [entity]);
    expect(await loadDeviceRegistry(redis)).toEqual([entity]);
  });

  test("returns an empty registry when the key is absent", async () => {
    const redis = { get: async () => null };
    expect(await loadDeviceRegistry(redis)).toEqual([]);
  });

  test("throws a clear error when registry JSON is invalid", async () => {
    const redis = { get: async () => "{" };
    await expect(loadDeviceRegistry(redis)).rejects.toThrow("Invalid device registry in Valkey");
  });

  test("throws a clear error when registry JSON is not an array", async () => {
    const redis = { get: async () => JSON.stringify({ devices: [entity] }) };
    await expect(loadDeviceRegistry(redis)).rejects.toThrow("Invalid device registry in Valkey");
  });

  test("throws a clear error when a switch entity is malformed", async () => {
    const redis = { get: async () => JSON.stringify([{ ...entity, id: 9354 }]) };
    await expect(loadDeviceRegistry(redis)).rejects.toThrow("Invalid device registry in Valkey");
  });

  test("throws a clear error when a light entity is malformed", async () => {
    const light = {
      ...entity,
      kind: "light",
      capabilities: ["brightness"],
      brightness: { min: 0, max: 100, step: Number.POSITIVE_INFINITY },
    };
    const redis = { get: async () => JSON.stringify([light]) };
    await expect(loadDeviceRegistry(redis)).rejects.toThrow("Invalid device registry in Valkey");
  });
});
