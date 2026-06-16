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
  sourceId: "09354",
  sourceAddress: 9354,
  kind: "switch",
  capability: "on_off",
  name: "Hall",
  productType: "RFSA-66M",
  rf003Type: "unknown",
  objectId: "inels_9354",
};

const lightEntity: DiscoveredEntity = {
  id: "07101",
  sourceId: "07101",
  sourceAddress: 7101,
  kind: "light",
  capability: "brightness",
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
    const setSwitchCalls: unknown[][] = [];
    const deps = makeDeps({
      operations: {
        ...makeDeps().operations,
        setSwitch: async (...args) => {
          setSwitchCalls.push(args);
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
    expect(setSwitchCalls).toEqual([["09354", true]]);
  });

  test("handles set output OFF by writing false", async () => {
    const setSwitchCalls: unknown[][] = [];
    const deps = makeDeps({
      operations: {
        ...makeDeps().operations,
        setSwitch: async (...args) => {
          setSwitchCalls.push(args);
        },
      },
    });
    createGatewayWorker({ host: "localhost", port: 6379 }, logger, deps);

    await capturedProcessor?.({ name: GatewayJobName.SetOutput, data: { deviceId: "09354", state: "OFF" } });

    expect(setSwitchCalls).toEqual([["09354", false]]);
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

  test("discovery clears removed entities after saving registry and before publishing current discovery", async () => {
    const calls: string[] = [];
    const cleared: DiscoveredEntity[] = [];
    const deps = makeDeps({
      loadRegistry: async () => [switchEntity],
      operations: {
        ...makeDeps().operations,
        listDeviceIds: async () => [],
      },
      saveRegistry: async () => {
        calls.push("saveRegistry");
      },
      clearDiscovery: async (entity: DiscoveredEntity) => {
        calls.push("clearDiscovery");
        cleared.push(entity);
      },
      publishDiscovery: async () => {
        calls.push("publishDiscovery");
      },
    });
    createGatewayWorker({ host: "localhost", port: 6379 }, logger, deps);

    await capturedProcessor?.({ name: GatewayJobName.ForceDiscovery, data: {} });

    expect(calls).toEqual(["saveRegistry", "clearDiscovery", "publishDiscovery"]);
    expect(cleared).toEqual([switchEntity]);
  });

  test("discovery clears previous entity when source address remains but kind changes", async () => {
    const previousLight: DiscoveredEntity = {
      ...lightEntity,
      id: "09354",
      sourceId: "09354",
      sourceAddress: switchEntity.sourceAddress,
      objectId: switchEntity.objectId,
    };
    const cleared: DiscoveredEntity[] = [];
    const deps = makeDeps({
      loadRegistry: async () => [previousLight],
      clearDiscovery: async (entity: DiscoveredEntity) => {
        cleared.push(entity);
      },
    });
    createGatewayWorker({ host: "localhost", port: 6379 }, logger, deps);

    await capturedProcessor?.({ name: GatewayJobName.PublishDiscovery, data: {} });

    expect(cleared).toEqual([previousLight]);
  });

  test("discovery clears previous entity when source address remains but object ID changes", async () => {
    const previousSwitch: DiscoveredEntity = { ...switchEntity, objectId: "inels_09354" };
    const cleared: DiscoveredEntity[] = [];
    const deps = makeDeps({
      loadRegistry: async () => [previousSwitch],
      clearDiscovery: async (entity: DiscoveredEntity) => {
        cleared.push(entity);
      },
    });
    createGatewayWorker({ host: "localhost", port: 6379 }, logger, deps);

    await capturedProcessor?.({ name: GatewayJobName.PublishDiscovery, data: {} });

    expect(cleared).toEqual([previousSwitch]);
  });

  test("discovery clears normalized legacy entity when source address changes domain", async () => {
    const legacySwitch: DiscoveredEntity = { ...switchEntity, objectId: "inels_09354" };
    const cleared: DiscoveredEntity[] = [];
    const deps = makeDeps({
      loadRegistry: async () => [legacySwitch],
      operations: {
        ...makeDeps().operations,
        getDeviceDetail: async () => ({
          "device info": { label: "Hall Fan", "product type": "RFSA-66M", type: "ventilation", address: 9354 },
          "actions info": { on: { type: "bool" } },
          "primary actions": ["on"],
        }),
      },
      clearDiscovery: async (entity: DiscoveredEntity) => {
        cleared.push(entity);
      },
    });
    createGatewayWorker({ host: "localhost", port: 6379 }, logger, deps);

    await capturedProcessor?.({ name: GatewayJobName.PublishDiscovery, data: {} });

    expect(cleared).toEqual([legacySwitch]);
  });

  test("discovery does not clear unchanged entities", async () => {
    const cleared: DiscoveredEntity[] = [];
    const deps = makeDeps({
      loadRegistry: async () => [switchEntity],
      clearDiscovery: async (entity: DiscoveredEntity) => {
        cleared.push(entity);
      },
    });
    createGatewayWorker({ host: "localhost", port: 6379 }, logger, deps);

    await capturedProcessor?.({ name: GatewayJobName.PublishDiscovery, data: {} });

    expect(cleared).toEqual([]);
  });

  test("handles set brightness by writing and publishing read-back state", async () => {
    const calls: string[] = [];
    const states: unknown[] = [];
    const setBrightnessCalls: unknown[][] = [];
    const deps = makeDeps({
      loadRegistry: async () => [{ ...lightEntity, id: "47742" }],
      operations: {
        ...makeDeps().operations,
        setBrightness: async (...args) => {
          setBrightnessCalls.push(args);
          const [, brightness] = args;
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

    await capturedProcessor?.({ name: GatewayJobName.SetBrightness, data: { deviceId: "47742", brightness: 50 } });

    expect(calls).toEqual(["setBrightness:50", "saveState", "publishState", "updateLastSuccess"]);
    expect(setBrightnessCalls).toEqual([["47742", 50]]);
    expect(states).toEqual([{ brightness: 42 }, { brightness: 42 }]);
  });

  test("malformed set output throws before gateway operation", async () => {
    let setSwitchCalled = false;
    const deps = makeDeps({
      operations: {
        ...makeDeps().operations,
        setSwitch: async () => {
          setSwitchCalled = true;
        },
      },
    });
    createGatewayWorker({ host: "localhost", port: 6379 }, logger, deps);

    await expect(capturedProcessor?.({ name: GatewayJobName.SetOutput, data: { deviceId: "09354" } })).rejects.toThrow(
      "Invalid command.set_output job data",
    );
    expect(setSwitchCalled).toBe(false);
  });

  test("malformed set brightness throws before gateway operation", async () => {
    let setBrightnessCalled = false;
    const deps = makeDeps({
      operations: {
        ...makeDeps().operations,
        setBrightness: async () => {
          setBrightnessCalled = true;
        },
      },
    });
    createGatewayWorker({ host: "localhost", port: 6379 }, logger, deps);

    await expect(capturedProcessor?.({ name: GatewayJobName.SetBrightness, data: { deviceId: "47742", brightness: 101 } })).rejects.toThrow(
      "Invalid command.set_brightness job data",
    );
    expect(setBrightnessCalled).toBe(false);
  });

  test("malformed poll device state throws before gateway operation", async () => {
    let getDeviceStateCalled = false;
    const deps = makeDeps({
      operations: {
        ...makeDeps().operations,
        getDeviceState: async () => {
          getDeviceStateCalled = true;
          return { on: true };
        },
      },
    });
    createGatewayWorker({ host: "localhost", port: 6379 }, logger, deps);

    await expect(capturedProcessor?.({ name: GatewayJobName.PollDeviceState, data: { deviceId: 9354 } })).rejects.toThrow(
      "Invalid poll.device_state job data",
    );
    expect(getDeviceStateCalled).toBe(false);
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

  test("empty poll full state does not read gateway state or mark success", async () => {
    let getDeviceStateCalled = false;
    let updateLastSuccessCalled = false;
    const deps = makeDeps({
      loadRegistry: async () => [],
      operations: {
        ...makeDeps().operations,
        getDeviceState: async () => {
          getDeviceStateCalled = true;
          return { on: true };
        },
      },
      updateLastSuccess: async () => {
        updateLastSuccessCalled = true;
      },
    });
    createGatewayWorker({ host: "localhost", port: 6379 }, logger, deps);

    await capturedProcessor?.({ name: GatewayJobName.PollFullState, data: {} });

    expect(getDeviceStateCalled).toBe(false);
    expect(updateLastSuccessCalled).toBe(false);
  });

  test("set output still sends the gateway command when registry is empty and read-back has no entity", async () => {
    let setSwitchCalled = false;
    let updateLastSuccessCalled = false;
    const deps = makeDeps({
      loadRegistry: async () => [],
      operations: {
        ...makeDeps().operations,
        setSwitch: async () => {
          setSwitchCalled = true;
        },
      },
      updateLastSuccess: async () => {
        updateLastSuccessCalled = true;
      },
    });
    createGatewayWorker({ host: "localhost", port: 6379 }, logger, deps);

    await expect(
      capturedProcessor?.({ name: GatewayJobName.SetOutput, data: { deviceId: "09354", state: "ON" } }),
    ).rejects.toThrow("Device 09354 not found in registry");
    expect(setSwitchCalled).toBe(true);
    expect(updateLastSuccessCalled).toBe(false);
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
    clearDiscovery: async () => {},
    publishDiscovery: async () => {},
    publishState: async () => {},
    updateLastPoll: async () => {},
    updateLastSuccess: async () => {},
  };

  return { ...deps, ...overrides };
}

function makeSwitchDetail(): GatewayDeviceDetail {
  return {
    "device info": { label: "Hall", "product type": "RFSA-66M", type: "unknown", address: 9354 },
    "actions info": { on: { type: "bool" } },
    "primary actions": ["on"],
  };
}
