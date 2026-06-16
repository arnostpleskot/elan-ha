import { describe, expect, test } from "bun:test";
import type { DiscoveredEntity } from "../devices/types";
import { loadDeviceRegistry, saveDeviceRegistry } from "./registry";

const entity: DiscoveredEntity = {
  id: "09354",
  sourceId: "09354",
  sourceAddress: 9354,
  kind: "switch",
  capability: "on_off",
  name: "Strop - Chodba",
  productType: "RFSA-66M",
  rf003Type: "light",
  objectId: "inels_9354",
};

const fanEntity: DiscoveredEntity = {
  id: "09355",
  sourceId: "09355",
  sourceAddress: 9355,
  kind: "fan",
  capability: "on_off",
  name: "Bathroom Fan",
  productType: "RFSA-66M",
  rf003Type: "ventilation",
  objectId: "inels_9355",
};

const onOffLightEntity: DiscoveredEntity = {
  id: "09356",
  sourceId: "09356",
  sourceAddress: 9356,
  kind: "light",
  capability: "on_off",
  name: "Hall Light",
  productType: "RFSA-66M",
  rf003Type: "light",
  objectId: "inels_9356",
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

  test("loads fan and on/off light entities", async () => {
    const redis = { get: async () => JSON.stringify([fanEntity, onOffLightEntity]) };
    const { logger } = makeLogger();

    expect(await loadDeviceRegistry(redis, logger)).toEqual([fanEntity, onOffLightEntity]);
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

  test("returns an empty registry and logs warn when sourceAddress is malformed", async () => {
    const redis = { get: async () => JSON.stringify([{ ...entity, sourceAddress: 9354.5 }]) };
    const { logger, warnings } = makeLogger();

    expect(await loadDeviceRegistry(redis, logger)).toEqual([]);
    expect(warnings).toHaveLength(1);
  });

  test("returns an empty registry and logs warn when objectId does not match sourceAddress", async () => {
    const redis = { get: async () => JSON.stringify([{ ...entity, objectId: "inels_09354" }]) };
    const { logger, warnings } = makeLogger();

    expect(await loadDeviceRegistry(redis, logger)).toEqual([]);
    expect(warnings).toHaveLength(1);
  });

  test("returns an empty registry and logs warn when a light entity is malformed", async () => {
    const light = {
      ...entity,
      kind: "light",
      capability: "brightness",
      capabilities: ["brightness"],
      brightness: { min: 0, max: 100, step: Number.POSITIVE_INFINITY },
    };
    const redis = { get: async () => JSON.stringify([light]) };
    const { logger, warnings } = makeLogger();

    expect(await loadDeviceRegistry(redis, logger)).toEqual([]);
    expect(warnings).toHaveLength(1);
  });

  test("truncates the raw payload in the schema-invalid warn log", async () => {
    const oversized = JSON.stringify(Array.from({ length: 500 }, () => ({ ...entity, id: 9354 })));
    expect(oversized.length).toBeGreaterThan(1000);
    const redis = { get: async () => oversized };
    const { logger, warnings } = makeLogger();

    expect(await loadDeviceRegistry(redis, logger)).toEqual([]);
    expect(warnings).toHaveLength(1);
    const rawField = (warnings[0]?.obj as { raw?: string }).raw;
    expect(typeof rawField).toBe("string");
    expect((rawField as string).length).toBeLessThanOrEqual(256);
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
