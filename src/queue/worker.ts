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
  deps: GatewayWorkerDeps = missingGatewayWorkerDeps(),
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
      await handleSetOutput(job.data as SetOutputData, deps);
      return;
    case GatewayJobName.SetBrightness:
      await handleSetBrightness(job.data as SetBrightnessData, deps);
      return;
    case GatewayJobName.PollFullState:
      await handlePollFullState(deps);
      return;
    case GatewayJobName.PollDeviceState:
      await handlePollDeviceState(job.data as DeviceStateData, deps);
      return;
    default:
      throw new Error(`Unknown gateway job: ${job.name}`);
  }
};

const handleDiscovery = async (deps: GatewayWorkerDeps, logger: Logger): Promise<void> => {
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

  await deps.saveRegistry(entities);
  await deps.publishDiscovery(entities);
  await deps.updateLastSuccess();
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

const missingGatewayWorkerDeps = (): GatewayWorkerDeps => {
  const fail = async (): Promise<never> => {
    throw new Error("Gateway worker dependencies are not configured");
  };

  return {
    operations: {
      listDeviceIds: fail,
      getDeviceDetail: fail,
      getDeviceState: fail,
      setSwitch: fail,
      setBrightness: fail,
    },
    loadRegistry: fail,
    saveRegistry: fail,
    saveState: fail,
    publishDiscovery: fail,
    publishState: fail,
    updateLastPoll: fail,
    updateLastSuccess: fail,
  };
};
