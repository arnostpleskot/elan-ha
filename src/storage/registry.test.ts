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

const makeLogger = () => {
  const warnings: Array<{ obj: unknown; msg: string }> = [];
  return {
    warnings,
    logger: { warn: (obj: object, msg: string) => warnings.push({ obj, msg }) },
  };
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
    const { logger } = makeLogger();

    await saveDeviceRegistry(redis, [entity]);
    expect(await loadDeviceRegistry(redis, logger)).toEqual([entity]);
  });

  test("returns an empty registry when the key is absent", async () => {
    const redis = { get: async () => null };
    const { logger, warnings } = makeLogger();

    expect(await loadDeviceRegistry(redis, logger)).toEqual([]);
    expect(warnings).toEqual([]);
  });

  test("returns an empty registry and logs warn when registry JSON is invalid", async () => {
    const redis = { get: async () => "{" };
    const { logger, warnings } = makeLogger();

    expect(await loadDeviceRegistry(redis, logger)).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.msg).toContain("registry");
  });

  test("returns an empty registry and logs warn when registry JSON is not an array", async () => {
    const redis = { get: async () => JSON.stringify({ devices: [entity] }) };
    const { logger, warnings } = makeLogger();

    expect(await loadDeviceRegistry(redis, logger)).toEqual([]);
    expect(warnings).toHaveLength(1);
  });

  test("returns an empty registry and logs warn when a switch entity is malformed", async () => {
    const redis = { get: async () => JSON.stringify([{ ...entity, id: 9354 }]) };
    const { logger, warnings } = makeLogger();

    expect(await loadDeviceRegistry(redis, logger)).toEqual([]);
    expect(warnings).toHaveLength(1);
  });

  test("returns an empty registry and logs warn when a light entity is malformed", async () => {
    const light = {
      ...entity,
      kind: "light",
      capabilities: ["brightness"],
      brightness: { min: 0, max: 100, step: Number.POSITIVE_INFINITY },
    };
    const redis = { get: async () => JSON.stringify([light]) };
    const { logger, warnings } = makeLogger();

    expect(await loadDeviceRegistry(redis, logger)).toEqual([]);
    expect(warnings).toHaveLength(1);
  });

  test("returns an empty registry and logs warn when valkey get rejects", async () => {
    const redis = {
      get: async () => {
        throw new Error("ECONNREFUSED");
      },
    };
    const { logger, warnings } = makeLogger();

    expect(await loadDeviceRegistry(redis, logger)).toEqual([]);
    expect(warnings).toHaveLength(1);
  });
});
