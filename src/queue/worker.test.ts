import { describe, expect, mock, test } from "bun:test";
import type { Logger } from "pino";
import type { DiscoveredEntity, GatewayDeviceDetail } from "../devices/types";
import { GatewayJobName } from "./jobs";
import type { GatewayWorkerDeps } from "./worker";

let capturedProcessor: ((job: { name: string; data: unknown }) => Promise<void>) | undefined;
let capturedOpts: { concurrency?: number } = {};

mock.module("bullmq", () => ({
  Worker: class MockWorker {
    constructor(_name: string, processor: typeof capturedProcessor, opts: { concurrency?: number } = {}) {
      capturedProcessor = processor;
      capturedOpts = opts;
    }
  },
}));

const { createGatewayWorker } = await import("./worker");

const logger = {
  child: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
} as unknown as Logger;

const switchEntity: DiscoveredEntity = {
  id: "09354",
  kind: "switch",
  name: "Hall",
  productType: "RFSA-66M",
  rf003Type: "light",
  objectId: "inels_09354",
};

const lightEntity: DiscoveredEntity = {
  id: "07101",
  kind: "light",
  capabilities: ["brightness"],
  name: "Kitchen",
  productType: "RFDA-71B",
  rf003Type: "dimmer",
  objectId: "inels_07101",
  brightness: { min: 0, max: 100, step: 1 },
};

describe("gateway worker", () => {
  test("is created with concurrency 1", () => {
    createGatewayWorker({ host: "localhost", port: 6379 }, logger, makeDeps());
    expect(capturedOpts.concurrency).toBe(1);
  });

  test("handles set output by writing, reading back, storing, and publishing", async () => {
    const calls: string[] = [];
    const deps = makeDeps({
      operations: {
        ...makeDeps().operations,
        setSwitch: async () => {
          calls.push("setSwitch");
        },
        getDeviceState: async () => ({ on: true }),
      },
      saveState: async () => {
        calls.push("saveState");
      },
      publishState: async () => {
        calls.push("publishState");
      },
      updateLastSuccess: async () => {
        calls.push("updateLastSuccess");
      },
    });
    createGatewayWorker({ host: "localhost", port: 6379 }, logger, deps);

    await capturedProcessor?.({ name: GatewayJobName.SetOutput, data: { deviceId: "09354", state: "ON" } });

    expect(calls).toEqual(["setSwitch", "saveState", "publishState", "updateLastSuccess"]);
  });

  test("discovery force saves only supported entities and publishes discovery", async () => {
    const calls: string[] = [];
    let saved: DiscoveredEntity[] = [];
    let published: DiscoveredEntity[] = [];
    const unsupportedDetail: GatewayDeviceDetail = {
      "device info": { label: "Unsupported", "product type": "Other", type: "sensor" },
      "actions info": {},
      "primary actions": [],
    };
    const deps = makeDeps({
      operations: {
        ...makeDeps().operations,
        listDeviceIds: async () => ["09354", "99999"],
        getDeviceDetail: async (id) => (id === "09354" ? makeSwitchDetail() : unsupportedDetail),
        getDeviceState: async (id) => (id === "09354" ? { on: true } : {}),
      },
      saveRegistry: async (entities) => {
        calls.push("saveRegistry");
        saved = entities;
      },
      publishDiscovery: async (entities) => {
        calls.push("publishDiscovery");
        published = entities;
      },
      updateLastSuccess: async () => {
        calls.push("updateLastSuccess");
      },
    });
    createGatewayWorker({ host: "localhost", port: 6379 }, logger, deps);

    await capturedProcessor?.({ name: GatewayJobName.ForceDiscovery, data: {} });

    expect(calls).toEqual(["saveRegistry", "publishDiscovery", "updateLastSuccess"]);
    expect(saved).toEqual([switchEntity]);
    expect(published).toEqual([switchEntity]);
  });

  test("handles set brightness by writing and publishing read-back state", async () => {
    const calls: string[] = [];
    const states: unknown[] = [];
    const deps = makeDeps({
      loadRegistry: async () => [lightEntity],
      operations: {
        ...makeDeps().operations,
        setBrightness: async (_deviceId, brightness) => {
          calls.push(`setBrightness:${brightness}`);
        },
        getDeviceState: async () => ({ brightness: 42 }),
      },
      saveState: async (_deviceId, state) => {
        calls.push("saveState");
        states.push(state);
      },
      publishState: async (_entity, state) => {
        calls.push("publishState");
        states.push(state);
      },
      updateLastSuccess: async () => {
        calls.push("updateLastSuccess");
      },
    });
    createGatewayWorker({ host: "localhost", port: 6379 }, logger, deps);

    await capturedProcessor?.({ name: GatewayJobName.SetBrightness, data: { deviceId: "07101", brightness: 42 } });

    expect(calls).toEqual(["setBrightness:42", "saveState", "publishState", "updateLastSuccess"]);
    expect(states).toEqual([{ brightness: 42 }, { brightness: 42 }]);
  });

  test("poll device state throws when device is absent from registry", async () => {
    createGatewayWorker({ host: "localhost", port: 6379 }, logger, makeDeps());

    await expect(capturedProcessor?.({ name: GatewayJobName.PollDeviceState, data: { deviceId: "missing" } })).rejects.toThrow(
      "Device missing not found in registry",
    );
  });

  test("unknown job throws", async () => {
    createGatewayWorker({ host: "localhost", port: 6379 }, logger, makeDeps());

    await expect(capturedProcessor?.({ name: "unknown.job", data: {} })).rejects.toThrow("Unknown gateway job: unknown.job");
  });
});

function makeDeps(overrides: Partial<GatewayWorkerDeps> = {}): GatewayWorkerDeps {
  const deps: GatewayWorkerDeps = {
    operations: {
      listDeviceIds: async () => ["09354"],
      getDeviceDetail: async () => makeSwitchDetail(),
      getDeviceState: async () => ({ on: true }),
      setSwitch: async () => {},
      setBrightness: async () => {},
    },
    loadRegistry: async () => [switchEntity],
    saveRegistry: async () => {},
    saveState: async () => {},
    publishDiscovery: async () => {},
    publishState: async () => {},
    updateLastPoll: async () => {},
    updateLastSuccess: async () => {},
  };

  return { ...deps, ...overrides };
}

function makeSwitchDetail(): GatewayDeviceDetail {
  return {
    "device info": { label: "Hall", "product type": "RFSA-66M", type: "light" },
    "actions info": { on: { type: "bool" } },
    "primary actions": ["on"],
  };
}
