import type { DiscoveredEntity } from "../devices/types";
import { deviceRegistryKey } from "./keys";

type RegistryRedis = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<unknown>;
};

export type RegistryLogger = {
  warn: (obj: object, msg: string) => void;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const truncate = (value: string, max: number): string =>
  value.length <= max ? value : `${value.slice(0, max)}… (${value.length - max} more chars)`;

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

// Registry corruption or unavailability is treated as an empty registry so the
// rest of the bridge degrades gracefully: discovery rebuilds the cache, polls
// and commands surface "not found" rather than crashing, and a single warn log
// captures the underlying cause. Callers must trust that this function never
// rejects.
export const loadDeviceRegistry = async (
  redis: Pick<RegistryRedis, "get">,
  logger: RegistryLogger,
): Promise<DiscoveredEntity[]> => {
  let raw: string | null;
  try {
    raw = await redis.get(deviceRegistryKey());
  } catch (err) {
    logger.warn({ err }, "device registry unavailable; treating as empty");
    return [];
  }

  if (raw === null) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    logger.warn({ err }, "device registry JSON invalid; treating as empty");
    return [];
  }

  if (!Array.isArray(parsed) || !parsed.every(isDiscoveredEntity)) {
    logger.warn({ raw: truncate(raw, 200) }, "device registry schema invalid; treating as empty");
    return [];
  }

  return parsed;
};

export const saveDeviceRegistry = async (
  redis: RegistryRedis,
  entities: DiscoveredEntity[],
): Promise<void> => {
  await redis.set(deviceRegistryKey(), JSON.stringify(entities));
};
