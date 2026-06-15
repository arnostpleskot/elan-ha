import type { DiscoveredEntity } from "../devices/types";
import { deviceRegistryKey } from "./keys";

type RegistryRedis = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<unknown>;
};

export const loadDeviceRegistry = async (redis: Pick<RegistryRedis, "get">): Promise<DiscoveredEntity[]> => {
  const raw = await redis.get(deviceRegistryKey());
  if (raw === null) {
    return [];
  }
  return JSON.parse(raw) as DiscoveredEntity[];
};

export const saveDeviceRegistry = async (
  redis: RegistryRedis,
  entities: DiscoveredEntity[],
): Promise<void> => {
  await redis.set(deviceRegistryKey(), JSON.stringify(entities));
};
