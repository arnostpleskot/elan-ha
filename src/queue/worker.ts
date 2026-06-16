import { Worker } from "bullmq";
import type { Logger } from "pino";
import { classifyGatewayDevice } from "../devices/registry";
import type { DiscoveredEntity, GatewayDeviceState } from "../devices/types";
import type { GatewayOperations } from "../gateway/operations";
import type { ValkeyConnectionOptions } from "../storage/valkey";
import { GatewayJobName } from "./jobs";

const QUEUE_NAME = "gateway";
const CONCURRENCY = 1;

export type GatewayWorkerDeps = {
  operations: GatewayOperations;
  loadRegistry: () => Promise<DiscoveredEntity[]>;
  saveRegistry: (entities: DiscoveredEntity[]) => Promise<void>;
  saveState: (deviceId: string, state: GatewayDeviceState) => Promise<void>;
  clearDiscovery: (entity: DiscoveredEntity) => Promise<void>;
  publishDiscovery: (entities: DiscoveredEntity[]) => Promise<void>;
  publishState: (entity: DiscoveredEntity, state: GatewayDeviceState) => Promise<void>;
  updateLastPoll: () => Promise<void>;
  updateLastSuccess: () => Promise<void>;
};

type GatewayJob = {
  name: string;
  data: unknown;
};

type SetOutputData = { deviceId: string; state: "ON" | "OFF" };
type SetBrightnessData = { deviceId: string; brightness: number };
type DeviceStateData = { deviceId: string };

export const createGatewayWorker = (
  connection: ValkeyConnectionOptions,
  logger: Logger,
  deps: GatewayWorkerDeps,
): Worker => {
  const workerLogger = logger.child({ module: "queue" });

  return new Worker(
    QUEUE_NAME,
    async (job) => processGatewayJob(job, deps, workerLogger),
    { connection, concurrency: CONCURRENCY },
  );
};

const processGatewayJob = async (job: GatewayJob, deps: GatewayWorkerDeps, logger: Logger): Promise<void> => {
  switch (job.name) {
    case GatewayJobName.ForceDiscovery:
    case GatewayJobName.PublishDiscovery:
      await handleDiscovery(deps, logger);
      return;
    case GatewayJobName.SetOutput:
      await handleSetOutput(parseSetOutputData(job.data), deps);
      return;
    case GatewayJobName.SetBrightness:
      await handleSetBrightness(parseSetBrightnessData(job.data), deps);
      return;
    case GatewayJobName.PollFullState:
      await handlePollFullState(deps);
      return;
    case GatewayJobName.PollDeviceState:
      await handlePollDeviceState(parseDeviceStateData(job.data), deps);
      return;
    default:
      throw new Error(`Unknown gateway job: ${job.name}`);
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseSetOutputData = (data: unknown): SetOutputData => {
  if (!isRecord(data) || typeof data.deviceId !== "string" || (data.state !== "ON" && data.state !== "OFF")) {
    throw new Error("Invalid command.set_output job data");
  }

  return { deviceId: data.deviceId, state: data.state };
};

const parseSetBrightnessData = (data: unknown): SetBrightnessData => {
  if (
    !isRecord(data) ||
    typeof data.deviceId !== "string" ||
    typeof data.brightness !== "number" ||
    !Number.isFinite(data.brightness) ||
    data.brightness < 0 ||
    data.brightness > 100
  ) {
    throw new Error("Invalid command.set_brightness job data");
  }

  return { deviceId: data.deviceId, brightness: data.brightness };
};

const parseDeviceStateData = (data: unknown): DeviceStateData => {
  if (!isRecord(data) || typeof data.deviceId !== "string") {
    throw new Error("Invalid poll.device_state job data");
  }

  return { deviceId: data.deviceId };
};

const handleDiscovery = async (deps: GatewayWorkerDeps, logger: Logger): Promise<void> => {
  const previousEntities = await deps.loadRegistry();
  const entities: DiscoveredEntity[] = [];

  for (const deviceId of await deps.operations.listDeviceIds()) {
    const detail = await deps.operations.getDeviceDetail(deviceId);
    const state = await deps.operations.getDeviceState(deviceId);
    const entity = classifyGatewayDevice({ id: deviceId, detail, state });

    if (entity === undefined) {
      logger.warn({ deviceId }, "unsupported gateway device ignored");
      continue;
    }

    entities.push(entity);
  }

  const staleEntities = findStaleDiscoveryEntities(previousEntities, entities);

  await deps.saveRegistry(entities);
  for (const entity of staleEntities) {
    await deps.clearDiscovery(entity);
  }
  await deps.publishDiscovery(entities);
  await deps.updateLastSuccess();
};

const findStaleDiscoveryEntities = (
  previousEntities: DiscoveredEntity[],
  currentEntities: DiscoveredEntity[],
): DiscoveredEntity[] => {
  const currentByObjectId = new Map(currentEntities.map((entity) => [entity.objectId, entity]));

  return previousEntities.filter((previousEntity) => {
    const currentEntity = currentByObjectId.get(previousEntity.objectId);
    return currentEntity === undefined || currentEntity.kind !== previousEntity.kind;
  });
};

const handleSetOutput = async (data: SetOutputData, deps: GatewayWorkerDeps): Promise<void> => {
  await deps.operations.setSwitch(data.deviceId, data.state === "ON");
  await publishReadBackState(data.deviceId, deps);
};

const handleSetBrightness = async (data: SetBrightnessData, deps: GatewayWorkerDeps): Promise<void> => {
  await deps.operations.setBrightness(data.deviceId, data.brightness);
  await publishReadBackState(data.deviceId, deps);
};

const publishReadBackState = async (deviceId: string, deps: GatewayWorkerDeps): Promise<void> => {
  const state = await deps.operations.getDeviceState(deviceId);
  const entity = await findRegistryEntity(deviceId, deps);

  await deps.saveState(deviceId, state);
  await deps.publishState(entity, state);
  await deps.updateLastSuccess();
};

const handlePollFullState = async (deps: GatewayWorkerDeps): Promise<void> => {
  for (const entity of await deps.loadRegistry()) {
    const state = await deps.operations.getDeviceState(entity.id);
    await deps.saveState(entity.id, state);
    await deps.publishState(entity, state);
  }

  await deps.updateLastPoll();
  await deps.updateLastSuccess();
};

const handlePollDeviceState = async (data: DeviceStateData, deps: GatewayWorkerDeps): Promise<void> => {
  const entity = await findRegistryEntity(data.deviceId, deps);
  const state = await deps.operations.getDeviceState(data.deviceId);

  await deps.saveState(data.deviceId, state);
  await deps.publishState(entity, state);
  await deps.updateLastPoll();
  await deps.updateLastSuccess();
};

const findRegistryEntity = async (deviceId: string, deps: GatewayWorkerDeps): Promise<DiscoveredEntity> => {
  const entity = (await deps.loadRegistry()).find((candidate) => candidate.id === deviceId);

  if (entity === undefined) {
    throw new Error(`Device ${deviceId} not found in registry`);
  }

  return entity;
};
