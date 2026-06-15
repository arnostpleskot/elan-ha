import type { DiscoveredEntity } from "../devices/types";
import { deviceRegistryKey } from "./keys";

type RegistryRedis = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<unknown>;
};

const invalidRegistryError = (): Error => new Error("Invalid device registry in Valkey");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasStringEntityFields = (value: Record<string, unknown>): boolean =>
  typeof value.id === "string" &&
  typeof value.name === "string" &&
  typeof value.productType === "string" &&
  typeof value.rf003Type === "string" &&
  typeof value.objectId === "string";

const isBrightnessCapability = (value: unknown): boolean =>
  Array.isArray(value) && value.length === 1 && value[0] === "brightness";

const isValidBrightness = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.min === "number" &&
  Number.isFinite(value.min) &&
  typeof value.max === "number" &&
  Number.isFinite(value.max) &&
  typeof value.step === "number" &&
  Number.isFinite(value.step);

const isDiscoveredEntity = (value: unknown): value is DiscoveredEntity => {
  if (!isRecord(value) || !hasStringEntityFields(value)) {
    return false;
  }

  if (value.kind === "switch") {
    return true;
  }

  return value.kind === "light" && isBrightnessCapability(value.capabilities) && isValidBrightness(value.brightness);
};

export const loadDeviceRegistry = async (redis: Pick<RegistryRedis, "get">): Promise<DiscoveredEntity[]> => {
  const raw = await redis.get(deviceRegistryKey());
  if (raw === null) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw invalidRegistryError();
  }

  if (!Array.isArray(parsed) || !parsed.every(isDiscoveredEntity)) {
    throw invalidRegistryError();
  }

  return parsed;
};

export const saveDeviceRegistry = async (
  redis: RegistryRedis,
  entities: DiscoveredEntity[],
): Promise<void> => {
  await redis.set(deviceRegistryKey(), JSON.stringify(entities));
};
