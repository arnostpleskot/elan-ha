import { describe, expect, test } from "bun:test";
import type { Logger } from "pino";
import type { AppConfig } from "../config/env";
import type { DiscoveredEntity } from "../devices/types";
import type { GatewayOperations } from "../gateway/operations";
import { GatewayJobName, JobPriority } from "../queue/jobs";
import {
  createAppHttpServerDeps,
  createGatewaySuccessTracker,
  createGatewayWorkerDeps,
  createMqttCommandEnqueuer,
  enqueueStartupGatewayJobs,
  scheduleStartupGatewayJobs,
} from "./app";

const config: AppConfig = {
  rf003: { baseUrl: "http://rf003.local", username: "user", password: "pass" },
  mqtt: { url: "mqtt://localhost", discoveryPrefix: "homeassistant", baseTopic: "inels" },
  valkey: { url: "redis://localhost:6379" },
  poll: { fullStateIntervalMs: 60_000, deviceStateIntervalMs: 300_000 },
  http: { host: "127.0.0.1", port: 3000 },
  logLevel: "info",
};

const operations: GatewayOperations = {
  listDeviceIds: async () => [],
  getDeviceDetail: async () => ({}),
  getDeviceState: async () => ({}),
  setSwitch: async () => {},
  setBrightness: async () => {},
};

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
  id: "47742",
  kind: "light",
  capabilities: ["brightness"],
  name: "Kitchen",
  productType: "RFDA-71B",
  rf003Type: "dimmer",
  objectId: "inels_47742",
  brightness: { min: 0, max: 100, step: 1 },
};

const commandJobOptions = { priority: JobPriority.Command, attempts: 3, backoff: { type: "exponential", delay: 1_000 } };
const discoveryJobOptions = { priority: JobPriority.Discovery, attempts: 3, backoff: { type: "exponential", delay: 1_000 } };
const pollJobOptions = { priority: JobPriority.Poll, attempts: 3, backoff: { type: "exponential", delay: 1_000 } };

describe("createGatewayWorkerDeps", () => {
  test("persists registry, states, and timestamps in Valkey", async () => {
    const sets: Array<[string, string]> = [];
    const valkey = {
      get: async () => JSON.stringify([switchEntity]),
      set: async (key: string, value: string) => {
        sets.push([key, value]);
      },
    };
    const deps = createGatewayWorkerDeps({ config, valkey, mqttClient: { publish: () => undefined }, operations, logger });

    await expect(deps.loadRegistry()).resolves.toEqual([switchEntity]);
    await deps.saveRegistry([switchEntity]);
    await deps.saveState("09354", { on: true });
    await deps.updateLastPoll();
    await deps.updateLastSuccess();

    expect(sets[0]).toEqual(["inels:devices", JSON.stringify([switchEntity])]);
    expect(sets[1]).toEqual(["inels:state:09354", JSON.stringify({ on: true })]);
    expect(sets[2]?.[0]).toBe("inels:meta:last_poll");
    expect(Number.isNaN(Date.parse(sets[2]?.[1] ?? ""))).toBe(false);
    expect(sets[3]?.[0]).toBe("inels:meta:last_success");
    expect(Number.isNaN(Date.parse(sets[3]?.[1] ?? ""))).toBe(false);
  });

  test("publishes retained discovery and read-back state payloads", async () => {
    const publishes: Array<[string, string] | [string, string, { retain?: boolean }]> = [];
    const mqttClient = {
      publish: (topic: string, payload: string, opts?: { retain?: boolean }) => {
        if (opts === undefined) {
          publishes.push([topic, payload]);
          return undefined;
        }
        publishes.push([topic, payload, opts]);
        return undefined;
      },
    };
    const deps = createGatewayWorkerDeps({
      config,
      valkey: { get: async () => null, set: async () => undefined },
      mqttClient,
      operations,
      logger,
    });

    await deps.publishDiscovery([switchEntity, lightEntity]);
    await deps.publishState(switchEntity, { on: true });
    await deps.publishState(lightEntity, { brightness: null });

    expect(publishes).toEqual([
      ["inels/status", "online", { retain: true }],
      [
        "homeassistant/switch/inels_09354/config",
        JSON.stringify({
          name: "Hall",
          unique_id: "inels_09354",
          object_id: "inels_09354",
          command_topic: "inels/switch/inels_09354/set",
          state_topic: "inels/switch/inels_09354/state",
          availability_topic: "inels/status",
          payload_available: "online",
          payload_not_available: "offline",
          payload_on: "ON",
          payload_off: "OFF",
          state_on: "ON",
          state_off: "OFF",
          device: {
            identifiers: ["inels_09354"],
            manufacturer: "ELKO EP",
            model: "RFSA-66M",
            name: "Hall",
            via_device: "inels_bridge",
          },
        }),
        { retain: true },
      ],
      [
        "homeassistant/light/inels_47742/config",
        JSON.stringify({
          name: "Kitchen",
          unique_id: "inels_47742",
          object_id: "inels_47742",
          command_topic: "inels/light/inels_47742/set",
          state_topic: "inels/light/inels_47742/state",
          availability_topic: "inels/status",
          payload_available: "online",
          payload_not_available: "offline",
          schema: "json",
          brightness: true,
          brightness_scale: 255,
          device: {
            identifiers: ["inels_47742"],
            manufacturer: "ELKO EP",
            model: "RFDA-71B",
            name: "Kitchen",
            via_device: "inels_bridge",
          },
        }),
        { retain: true },
      ],
      ["inels/switch/inels_09354/state", "ON"],
    ]);
  });

  test("clears retained discovery config for previous entity topic", async () => {
    const publishes: Array<[string, string, { retain?: boolean }]> = [];
    const mqttClient = {
      publish: (topic: string, payload: string, opts?: { retain?: boolean }) => {
        publishes.push([topic, payload, opts ?? {}]);
      },
    };
    const deps = createGatewayWorkerDeps({
      config,
      valkey: { get: async () => null, set: async () => undefined },
      mqttClient,
      operations,
      logger,
    });

    await deps.clearDiscovery(switchEntity);
    await deps.clearDiscovery(lightEntity);

    expect(publishes).toEqual([
      ["homeassistant/switch/inels_09354/config", "", { retain: true }],
      ["homeassistant/light/inels_47742/config", "", { retain: true }],
    ]);
  });
});

describe("createMqttCommandEnqueuer", () => {
  test("resolves switch object ID and enqueues set output job", async () => {
    const added: unknown[][] = [];
    const enqueue = createMqttCommandEnqueuer({
      valkey: { get: async () => JSON.stringify([switchEntity]) },
      queue: { add: async (...args: unknown[]) => added.push(args) },
      logger,
    });

    await enqueue({ kind: "switch", objectId: "inels_09354", state: "ON" });

    expect(added).toEqual([
      [GatewayJobName.SetOutput, { deviceId: "09354", state: "ON" }, commandJobOptions],
    ]);
  });

  test("resolves light object ID and enqueues set brightness job", async () => {
    const added: unknown[][] = [];
    const enqueue = createMqttCommandEnqueuer({
      valkey: { get: async () => JSON.stringify([lightEntity]) },
      queue: { add: async (...args: unknown[]) => added.push(args) },
      logger,
    });

    await enqueue({ kind: "light", objectId: "inels_47742", brightness: 50 });

    expect(added).toEqual([
      [GatewayJobName.SetBrightness, { deviceId: "47742", brightness: 50 }, commandJobOptions],
    ]);
  });

  test("does not enqueue unknown object ID", async () => {
    const added: unknown[][] = [];
    const enqueue = createMqttCommandEnqueuer({
      valkey: { get: async () => JSON.stringify([switchEntity]) },
      queue: { add: async (...args: unknown[]) => added.push(args) },
      logger,
    });

    await enqueue({ kind: "switch", objectId: "inels_unknown", state: "OFF" });

    expect(added).toEqual([]);
  });

  test("does not enqueue when object ID kind does not match command kind", async () => {
    const added: unknown[][] = [];
    const enqueue = createMqttCommandEnqueuer({
      valkey: { get: async () => JSON.stringify([switchEntity]) },
      queue: { add: async (...args: unknown[]) => added.push(args) },
      logger,
    });

    await enqueue({ kind: "light", objectId: "inels_09354", brightness: 50 });

    expect(added).toEqual([]);
  });
});

describe("app composition helpers", () => {
  test("force discovery adds a discovery job with discovery priority", async () => {
    const added: unknown[][] = [];
    const deps = createAppHttpServerDeps({
      config,
      mqttClient: { connected: true },
      valkey: { get: async () => null, ping: async () => "PONG" },
      queue: { add: async (...args: unknown[]) => added.push(args) },
      logger,
    });

    await deps.forceDiscovery();

    expect(added).toEqual([[GatewayJobName.ForceDiscovery, {}, discoveryJobOptions]]);
  });

  test("startup discovery is queued and full-state polling uses a stable scheduler", async () => {
    const added: unknown[][] = [];
    const schedulers: unknown[][] = [];

    await enqueueStartupGatewayJobs(
      {
        add: async (...args: unknown[]) => added.push(args),
        upsertJobScheduler: async (...args: unknown[]) => schedulers.push(args),
      },
      config,
    );

    expect(added).toEqual([[GatewayJobName.ForceDiscovery, {}, discoveryJobOptions]]);
    expect(schedulers).toEqual([
      [
        GatewayJobName.PollFullState,
        { every: config.poll.fullStateIntervalMs },
        { name: GatewayJobName.PollFullState, data: {}, opts: pollJobOptions },
      ],
    ]);
  });

  test("startup gateway job scheduling rejection is caught and logged", async () => {
    const err = new Error("scheduler down");
    const errors: unknown[][] = [];

    await scheduleStartupGatewayJobs(
      {
        add: async () => undefined,
        upsertJobScheduler: async () => {
          throw err;
        },
      },
      config,
      { error: (...args: unknown[]) => errors.push(args) },
    );

    expect(errors).toEqual([[{ err }, "failed to enqueue startup gateway jobs"]]);
  });

  test("HTTP getDevices returns the Valkey registry", async () => {
    const deps = createAppHttpServerDeps({
      config,
      mqttClient: { connected: true },
      valkey: { get: async () => JSON.stringify([switchEntity]), ping: async () => "PONG" },
      queue: { add: async () => undefined },
      logger,
    });

    await expect(deps.getDevices()).resolves.toEqual([switchEntity]);
  });

  test("HTTP getDevices returns empty registry and logs warn when Valkey is corrupt", async () => {
    const warnings: Array<{ obj: unknown; msg: string }> = [];
    const captureLogger = {
      child: () => ({
        info: () => {},
        warn: (obj: object, msg: string) => warnings.push({ obj, msg }),
        error: () => {},
        debug: () => {},
      }),
    } as unknown as Logger;
    const deps = createAppHttpServerDeps({
      config,
      mqttClient: { connected: true },
      valkey: { get: async () => "{", ping: async () => "PONG" },
      queue: { add: async () => undefined },
      logger: captureLogger,
    });

    await expect(deps.getDevices()).resolves.toEqual([]);
    expect(warnings).toHaveLength(1);
  });

  test("MQTT command enqueuer drops command and logs warn when Valkey is corrupt", async () => {
    const added: unknown[][] = [];
    const warnings: Array<{ obj: unknown; msg: string }> = [];
    const captureLogger = {
      child: () => ({
        info: () => {},
        warn: (obj: object, msg: string) => warnings.push({ obj, msg }),
        error: () => {},
        debug: () => {},
      }),
    } as unknown as Logger;
    const enqueue = createMqttCommandEnqueuer({
      valkey: { get: async () => "{" },
      queue: { add: async (...args: unknown[]) => added.push(args) },
      logger: captureLogger,
    });

    await enqueue({ kind: "switch", objectId: "inels_09354", state: "ON" });

    expect(added).toEqual([]);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
  });

  test("readiness ignores persisted worker success metadata after app start", async () => {
    const deps = createAppHttpServerDeps({
      config,
      mqttClient: { connected: true },
      valkey: {
        get: async () => new Date().toISOString(),
        ping: async () => "PONG",
      },
      queue: { add: async () => undefined },
      logger,
      gatewaySuccessTracker: createGatewaySuccessTracker(),
    });

    await expect(deps.getReadiness()).resolves.toEqual({ ready: false, mqtt: true, valkey: true, rf003: false });
  });

  test("readiness marks RF-003 ready after current-process worker success", async () => {
    const gatewaySuccessTracker = createGatewaySuccessTracker();
    const workerDeps = createGatewayWorkerDeps({
      config,
      valkey: { get: async () => null, set: async () => undefined },
      mqttClient: { publish: () => undefined },
      operations,
      logger,
      gatewaySuccessTracker,
    });
    const httpDeps = createAppHttpServerDeps({
      config,
      mqttClient: { connected: true },
      valkey: { get: async () => null, ping: async () => "PONG" },
      queue: { add: async () => undefined },
      logger,
      gatewaySuccessTracker,
    });

    await workerDeps.updateLastSuccess();

    await expect(httpDeps.getReadiness()).resolves.toEqual({ ready: true, mqtt: true, valkey: true, rf003: true });
  });

  test("readiness marks RF-003 down when worker success metadata is missing", async () => {
    const deps = createAppHttpServerDeps({
      config,
      mqttClient: { connected: true },
      valkey: { get: async () => null, ping: async () => "PONG" },
      queue: { add: async () => undefined },
      logger,
    });

    await expect(deps.getReadiness()).resolves.toEqual({ ready: false, mqtt: true, valkey: true, rf003: false });
  });

  test("readiness marks RF-003 down when worker success metadata is stale", async () => {
    const staleTimestamp = new Date(Date.now() - Math.max(config.poll.fullStateIntervalMs * 2, 60_000) - 1).toISOString();
    const deps = createAppHttpServerDeps({
      config,
      mqttClient: { connected: true },
      valkey: { get: async () => staleTimestamp, ping: async () => "PONG" },
      queue: { add: async () => undefined },
      logger,
    });

    await expect(deps.getReadiness()).resolves.toEqual({ ready: false, mqtt: true, valkey: true, rf003: false });
  });

  test("readiness marks RF-003 down when worker success metadata is malformed", async () => {
    const deps = createAppHttpServerDeps({
      config,
      mqttClient: { connected: true },
      valkey: { get: async () => "not-a-date", ping: async () => "PONG" },
      queue: { add: async () => undefined },
      logger,
    });

    await expect(deps.getReadiness()).resolves.toEqual({ ready: false, mqtt: true, valkey: true, rf003: false });
  });
});
