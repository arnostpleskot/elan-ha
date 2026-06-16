import type { Logger } from "pino";
import type { AppConfig } from "../config/env";
import type { DiscoveredEntity } from "../devices/types";
import { createGatewayClient } from "../gateway/client";
import { createGatewayOperations, type GatewayOperations } from "../gateway/operations";
import { createGatewaySession } from "../gateway/session";
import { createMqttClient, type EnqueueMqttCommand, type MqttCommand } from "../mqtt/client";
import { buildDiscoveryPayload } from "../mqtt/discovery";
import { buildMqttStatePayload } from "../mqtt/state";
import { lightDiscoveryTopic, lightStateTopic, switchDiscoveryTopic, switchStateTopic } from "../mqtt/topics";
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

const discoveryTopic = (config: AppConfig, entity: DiscoveredEntity): string =>
  entity.kind === "switch"
    ? switchDiscoveryTopic(config.mqtt.discoveryPrefix, entity.objectId)
    : lightDiscoveryTopic(config.mqtt.discoveryPrefix, entity.objectId);

const stateTopic = (config: AppConfig, entity: DiscoveredEntity): string =>
  entity.kind === "switch"
    ? switchStateTopic(config.mqtt.baseTopic, entity.objectId)
    : lightStateTopic(config.mqtt.baseTopic, entity.objectId);

type WorkerDepsValkey = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<unknown>;
};

type WorkerDepsMqttClient = {
  publish: (topic: string, payload: string, opts?: { retain?: boolean }) => unknown;
};

type CommandQueue = {
  add: (name: string, data: unknown, opts?: { priority?: number }) => Promise<unknown> | unknown;
};

type CommandValkey = {
  get: (key: string) => Promise<string | null>;
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
    const entity = (await loadDeviceRegistry(valkey)).find((candidate) => candidate.objectId === command.objectId);
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

    if (command.kind === "switch") {
      await queue.add(
        GatewayJobName.SetOutput,
        { deviceId: entity.id, state: command.state },
        { priority: JobPriority.Command },
      );
      return;
    }

    await queue.add(
      GatewayJobName.SetBrightness,
      { deviceId: entity.id, brightness: command.brightness },
      { priority: JobPriority.Command },
    );
  };
};

export const createGatewayWorkerDeps = ({
  config,
  valkey,
  mqttClient,
  operations,
}: {
  config: AppConfig;
  valkey: WorkerDepsValkey;
  mqttClient: WorkerDepsMqttClient;
  operations: GatewayOperations;
}): GatewayWorkerDeps => ({
  operations,
  loadRegistry: () => loadDeviceRegistry(valkey),
  saveRegistry: (entities) => saveDeviceRegistry(valkey, entities),
  saveState: async (deviceId, state) => {
    await valkey.set(stateKey(deviceId), JSON.stringify(state));
  },
  publishDiscovery: async (entities) => {
    for (const entity of entities) {
      mqttClient.publish(
        discoveryTopic(config, entity),
        JSON.stringify(buildDiscoveryPayload({ baseTopic: config.mqtt.baseTopic, bridgeName: BRIDGE_NAME, entity })),
        { retain: true },
      );
    }
  },
  publishState: async (entity, state) => {
    const payload = buildMqttStatePayload({ kind: entity.kind, state });
    if (payload !== undefined) {
      mqttClient.publish(stateTopic(config, entity), payload);
    }
  },
  updateLastPoll: async () => {
    await valkey.set(lastPollKey(), new Date().toISOString());
  },
  updateLastSuccess: async () => {
    await valkey.set(lastSuccessKey(), new Date().toISOString());
  },
});

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
    createGatewayWorker(connection, logger, createGatewayWorkerDeps({ config, valkey, mqttClient, operations }));

    const httpLogger = logger.child({ module: "http" });
    const server = createHttpServer({
      getReadiness: () => checkReadiness(mqttClient, valkey),
    });

    server.listen({
      hostname: config.http.host,
      port: config.http.port,
    });

    httpLogger.info({ host: config.http.host, port: config.http.port }, "http server started");
  },
});
