import type { Logger } from "pino";
import type { AppConfig } from "../config/env";
import type { DiscoveredEntity } from "../devices/types";
import { createGatewayClient } from "../gateway/client";
import { createGatewayOperations, type GatewayOperations } from "../gateway/operations";
import { createGatewaySession } from "../gateway/session";
import { createMqttClient, type EnqueueMqttCommand, type MqttCommand } from "../mqtt/client";
import { buildDiscoveryPayload } from "../mqtt/discovery";
import { buildMqttStatePayload } from "../mqtt/state";
import {
  availabilityTopic,
  fanDiscoveryTopic,
  fanStateTopic,
  lightDiscoveryTopic,
  lightStateTopic,
  switchDiscoveryTopic,
  switchStateTopic,
} from "../mqtt/topics";
import { checkReadiness } from "../observability/readiness";
import { GatewayJobName, JobPriority } from "../queue/jobs";
import { createGatewayQueue } from "../queue/scheduler";
import { createGatewayWorker, type GatewayWorkerDeps } from "../queue/worker";
import { lastPollKey, lastSuccessKey, stateKey } from "../storage/keys";
import { loadDeviceRegistry, saveDeviceRegistry } from "../storage/registry";
import { createValkeyClient, parseValkeyConnectionOptions } from "../storage/valkey";
import { createHttpServer } from "../http/server";

export type App = {
  start: () => void;
};

const BRIDGE_NAME = "iNELS Bridge";

const discoveryTopic = (config: AppConfig, entity: DiscoveredEntity): string => {
  if (entity.kind === "switch") {
    return switchDiscoveryTopic(config.mqtt.discoveryPrefix, entity.objectId);
  }
  if (entity.kind === "fan") {
    return fanDiscoveryTopic(config.mqtt.discoveryPrefix, entity.objectId);
  }
  return lightDiscoveryTopic(config.mqtt.discoveryPrefix, entity.objectId);
};

const stateTopic = (config: AppConfig, entity: DiscoveredEntity): string => {
  if (entity.kind === "switch") {
    return switchStateTopic(config.mqtt.baseTopic, entity.objectId);
  }
  if (entity.kind === "fan") {
    return fanStateTopic(config.mqtt.baseTopic, entity.objectId);
  }
  return lightStateTopic(config.mqtt.baseTopic, entity.objectId);
};

type WorkerDepsValkey = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<unknown>;
};

type WorkerDepsMqttClient = {
  publish: (topic: string, payload: string, opts?: { retain?: boolean }) => unknown;
};

type GatewayJobOptions = {
  priority: number;
  attempts: number;
  backoff: { type: "exponential"; delay: number };
};

type CommandQueue = {
  add: (name: string, data: unknown, opts?: GatewayJobOptions) => Promise<unknown> | unknown;
};

type CommandValkey = {
  get: (key: string) => Promise<string | null>;
};

type AppHttpMqttClient = {
  connected: boolean;
};

type AppHttpValkey = {
  get: (key: string) => Promise<string | null>;
  ping: () => Promise<unknown>;
};

type GatewayCommandQueue = {
  add: (name: string, data: unknown, opts?: GatewayJobOptions) => Promise<unknown> | unknown;
};

type GatewaySchedulerQueue = GatewayCommandQueue & {
  upsertJobScheduler: (
    id: string,
    repeat: { every: number },
    template: { name: string; data: unknown; opts?: GatewayJobOptions },
  ) => Promise<unknown> | unknown;
};

type AppLogger = {
  error: (obj: unknown, msg: string) => void;
};

export type GatewaySuccessTracker = {
  getLastSuccessAtMs: () => number | undefined;
  recordSuccess: (timestampMs?: number) => void;
};

export const createGatewaySuccessTracker = (): GatewaySuccessTracker => {
  let lastGatewaySuccessAtMs: number | undefined;

  return {
    getLastSuccessAtMs: () => lastGatewaySuccessAtMs,
    recordSuccess: (timestampMs = Date.now()) => {
      lastGatewaySuccessAtMs = timestampMs;
    },
  };
};

export const isRecentIsoTimestamp = (value: string | null, nowMs: number, maxAgeMs: number): boolean => {
  if (value === null) {
    return false;
  }

  const timestampMs = Date.parse(value);
  if (!Number.isFinite(timestampMs)) {
    return false;
  }

  const ageMs = nowMs - timestampMs;
  return ageMs >= 0 && ageMs <= maxAgeMs;
};

const gatewayJobOptions = (priority: number): GatewayJobOptions => ({
  priority,
  attempts: 3,
  backoff: { type: "exponential", delay: 1_000 },
});

const commandJobOptions = (): GatewayJobOptions => gatewayJobOptions(JobPriority.Command);

const discoveryJobOptions = (): GatewayJobOptions => gatewayJobOptions(JobPriority.Discovery);

const pollJobOptions = (): GatewayJobOptions => gatewayJobOptions(JobPriority.Poll);

const publishAvailability = (mqttClient: WorkerDepsMqttClient, baseTopic: string): void => {
  mqttClient.publish(availabilityTopic(baseTopic), "online", { retain: true });
};

export const createAppHttpServerDeps = ({
  config,
  mqttClient,
  valkey,
  queue,
  logger,
  gatewaySuccessTracker = createGatewaySuccessTracker(),
}: {
  config: AppConfig;
  mqttClient: AppHttpMqttClient;
  valkey: AppHttpValkey;
  queue: GatewayCommandQueue;
  logger: Logger;
  gatewaySuccessTracker?: GatewaySuccessTracker;
}) => {
  const httpLogger = logger.child({ module: "http", component: "devices" });

  return {
    getReadiness: () =>
      checkReadiness(mqttClient, valkey, async () => {
        const lastSuccessAtMs = gatewaySuccessTracker.getLastSuccessAtMs();
        return lastSuccessAtMs !== undefined &&
          isRecentIsoTimestamp(
            new Date(lastSuccessAtMs).toISOString(),
            Date.now(),
            Math.max(config.poll.fullStateIntervalMs * 2, 60_000),
          );
      }),
    forceDiscovery: async () => {
      await queue.add(GatewayJobName.ForceDiscovery, {}, discoveryJobOptions());
    },
    getDevices: () => loadDeviceRegistry(valkey, httpLogger),
  };
};

export const enqueueStartupGatewayJobs = async (queue: GatewaySchedulerQueue, config: AppConfig): Promise<void> => {
  await queue.add(GatewayJobName.ForceDiscovery, {}, discoveryJobOptions());
  await queue.upsertJobScheduler(GatewayJobName.PollFullState, { every: config.poll.fullStateIntervalMs }, {
    name: GatewayJobName.PollFullState,
    data: {},
    opts: pollJobOptions(),
  });
};

export const scheduleStartupGatewayJobs = async (
  queue: GatewaySchedulerQueue,
  config: AppConfig,
  logger: AppLogger,
): Promise<void> => {
  try {
    await enqueueStartupGatewayJobs(queue, config);
  } catch (err) {
    logger.error({ err }, "failed to enqueue startup gateway jobs");
  }
};

export const createMqttCommandEnqueuer = ({
  valkey,
  queue,
  logger,
}: {
  valkey: CommandValkey;
  queue: CommandQueue;
  logger: Logger;
}): EnqueueMqttCommand => {
  const appLogger = logger.child({ module: "app", component: "mqtt-command" });

  return async (command: MqttCommand) => {
    const entity = (await loadDeviceRegistry(valkey, appLogger)).find((candidate) => candidate.objectId === command.objectId);
    if (entity === undefined) {
      appLogger.warn({ objectId: command.objectId, kind: command.kind }, "mqtt command object id not found");
      return;
    }

    if (entity.kind !== command.kind) {
      appLogger.warn(
        { objectId: command.objectId, commandKind: command.kind, entityKind: entity.kind },
        "mqtt command kind does not match registry entity",
      );
      return;
    }

    if (command.kind === "switch" || command.kind === "fan") {
      await queue.add(
        GatewayJobName.SetOutput,
        { deviceId: entity.id, state: command.state },
        commandJobOptions(),
      );
      return;
    }

    if (entity.capability === "on_off" && "state" in command) {
      await queue.add(
        GatewayJobName.SetOutput,
        { deviceId: entity.id, state: command.state },
        commandJobOptions(),
      );
      return;
    }

    if (entity.capability !== "brightness" || !("brightness" in command)) {
      appLogger.warn(
        { objectId: command.objectId, commandKind: command.kind, capability: entity.capability },
        "mqtt command capability does not match registry entity",
      );
      return;
    }

    await queue.add(
      GatewayJobName.SetBrightness,
      { deviceId: entity.id, brightness: command.brightness },
      commandJobOptions(),
    );
  };
};

export const createGatewayWorkerDeps = ({
  config,
  valkey,
  mqttClient,
  operations,
  logger,
  gatewaySuccessTracker,
}: {
  config: AppConfig;
  valkey: WorkerDepsValkey;
  mqttClient: WorkerDepsMqttClient;
  operations: GatewayOperations;
  logger: Logger;
  gatewaySuccessTracker?: GatewaySuccessTracker;
}): GatewayWorkerDeps => {
  const registryLogger = logger.child({ module: "queue", component: "registry" });

  return {
    operations,
    loadRegistry: () => loadDeviceRegistry(valkey, registryLogger),
    saveRegistry: (entities) => saveDeviceRegistry(valkey, entities),
    saveState: async (deviceId, state) => {
      await valkey.set(stateKey(deviceId), JSON.stringify(state));
    },
    clearDiscovery: async (entity) => {
      mqttClient.publish(discoveryTopic(config, entity), "", { retain: true });
    },
    publishDiscovery: async (entities) => {
      publishAvailability(mqttClient, config.mqtt.baseTopic);
      for (const entity of entities) {
        mqttClient.publish(
          discoveryTopic(config, entity),
          JSON.stringify(buildDiscoveryPayload({ baseTopic: config.mqtt.baseTopic, bridgeName: BRIDGE_NAME, entity })),
          { retain: true },
        );
      }
    },
    publishState: async (entity, state) => {
      const payload = buildMqttStatePayload({ capability: entity.capability, kind: entity.kind, state });
      if (payload !== undefined) {
        mqttClient.publish(stateTopic(config, entity), payload);
      }
    },
    updateLastPoll: async () => {
      await valkey.set(lastPollKey(), new Date().toISOString());
    },
    updateLastSuccess: async () => {
      const timestampMs = Date.now();
      await valkey.set(lastSuccessKey(), new Date(timestampMs).toISOString());
      gatewaySuccessTracker?.recordSuccess(timestampMs);
    },
  };
};

export const createApp = (config: AppConfig, logger: Logger): App => ({
  start: () => {
    const valkey = createValkeyClient(config.valkey.url);
    const connection = parseValkeyConnectionOptions(config.valkey.url);
    const gatewayQueue = createGatewayQueue(connection);
    const mqttClient = createMqttClient(
      config.mqtt,
      logger,
      createMqttCommandEnqueuer({ valkey, queue: gatewayQueue, logger }),
    );
    const session = createGatewaySession(config.rf003, logger);
    const client = createGatewayClient(config.rf003, session, logger);
    const operations = createGatewayOperations(client);
    const gatewaySuccessTracker = createGatewaySuccessTracker();
    createGatewayWorker(
      connection,
      logger,
      createGatewayWorkerDeps({ config, valkey, mqttClient, operations, logger, gatewaySuccessTracker }),
    );
    const appLogger = logger.child({ module: "app" });
    void scheduleStartupGatewayJobs(gatewayQueue, config, appLogger);

    const httpLogger = logger.child({ module: "http" });
    const server = createHttpServer(
      createAppHttpServerDeps({ config, mqttClient, valkey, queue: gatewayQueue, logger, gatewaySuccessTracker }),
    );

    server.listen({
      hostname: config.http.host,
      port: config.http.port,
    });

    httpLogger.info({ host: config.http.host, port: config.http.port }, "http server started");
  },
});
