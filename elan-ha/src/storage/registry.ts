import type { DiscoveredEntity } from "../devices/types";
import { deviceRegistryKey } from "./keys";

type RegistryRedis = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<unknown>;
};

export type RegistryLogger = {
  warn: (obj: object, msg: string) => void;
};

export const setJsonIfChanged = async (redis: RegistryRedis, key: string, value: unknown): Promise<void> => {
  const serialized = JSON.stringify(value);
  if ((await redis.get(key)) === serialized) {
    return;
  }
  await redis.set(key, serialized);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const truncate = (value: string, max: number): string =>
  value.length <= max ? value : `${value.slice(0, max)}… (${value.length - max} more chars)`;

const hasStringEntityFields = (value: Record<string, unknown>): boolean =>
  typeof value.id === "string" &&
  typeof value.sourceId === "string" &&
  typeof value.name === "string" &&
  typeof value.productType === "string" &&
  typeof value.rf003Type === "string" &&
  typeof value.objectId === "string";

const hasValidSourceAddress = (value: Record<string, unknown>): boolean =>
  typeof value.sourceAddress === "number" && Number.isInteger(value.sourceAddress) && value.sourceAddress >= 0;

const hasMatchingObjectId = (value: Record<string, unknown>): boolean => value.objectId === `inels_${value.sourceAddress}`;

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

const hasLegacyStringEntityFields = (value: Record<string, unknown>): boolean =>
  typeof value.id === "string" &&
  typeof value.name === "string" &&
  typeof value.productType === "string" &&
  typeof value.rf003Type === "string" &&
  typeof value.objectId === "string";

const legacySourceAddress = (value: Record<string, unknown>): number | undefined => {
  if (typeof value.id === "string") {
    const parsedId = Number.parseInt(value.id, 10);
    if (Number.isInteger(parsedId) && parsedId >= 0) {
      return parsedId;
    }
  }

  if (typeof value.objectId === "string") {
    const match = /^inels_(\d+)$/.exec(value.objectId);
    if (match?.[1] !== undefined) {
      return Number.parseInt(match[1], 10);
    }
  }

  return undefined;
};

const isDiscoveredEntity = (value: unknown): value is DiscoveredEntity => {
  if (!isRecord(value) || !hasStringEntityFields(value) || !hasValidSourceAddress(value) || !hasMatchingObjectId(value)) {
    return false;
  }

  if ((value.kind === "switch" || value.kind === "fan") && value.capability === "on_off") {
    return true;
  }

  if (value.kind !== "light") {
    return false;
  }

  if (value.capability === "on_off") {
    return true;
  }

  return value.capability === "brightness" && isBrightnessCapability(value.capabilities) && isValidBrightness(value.brightness);
};

const normalizeLegacyEntity = (value: unknown): DiscoveredEntity | undefined => {
  if (!isRecord(value) || !hasLegacyStringEntityFields(value)) {
    return undefined;
  }
  if (value.sourceId !== undefined || value.sourceAddress !== undefined || value.capability !== undefined) {
    return undefined;
  }

  const sourceAddress = legacySourceAddress(value);
  if (sourceAddress === undefined) {
    return undefined;
  }

  const base = {
    id: value.id as string,
    sourceId: value.id as string,
    sourceAddress,
    name: value.name as string,
    productType: value.productType as string,
    rf003Type: value.rf003Type as string,
    objectId: value.objectId as string,
  };

  if (value.kind === "switch") {
    return { ...base, kind: "switch", capability: "on_off" };
  }

  if (value.kind === "light" && isBrightnessCapability(value.capabilities) && isValidBrightness(value.brightness)) {
    return {
      ...base,
      kind: "light",
      capability: "brightness",
      capabilities: ["brightness"],
      brightness: value.brightness as { min: number; max: number; step: number },
    };
  }

  return undefined;
};

const normalizeRegistryEntity = (value: unknown): DiscoveredEntity | undefined => {
  if (isDiscoveredEntity(value)) {
    return value;
  }

  return normalizeLegacyEntity(value);
};

const isDefinedEntity = (value: DiscoveredEntity | undefined): value is DiscoveredEntity => value !== undefined;

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

  if (!Array.isArray(parsed)) {
    logger.warn({ raw: truncate(raw, 200) }, "device registry schema invalid; treating as empty");
    return [];
  }

  const normalized = parsed.map(normalizeRegistryEntity);
  if (!normalized.every(isDefinedEntity)) {
    logger.warn({ raw: truncate(raw, 200) }, "device registry schema invalid; treating as empty");
    return [];
  }

  return normalized;
};

export const saveDeviceRegistry = async (
  redis: RegistryRedis,
  entities: DiscoveredEntity[],
): Promise<void> => {
  await setJsonIfChanged(redis, deviceRegistryKey(), entities);
};
