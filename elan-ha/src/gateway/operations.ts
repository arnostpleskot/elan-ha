import type { GatewayDeviceDetail, GatewayDeviceState } from "../devices/types";
import { gatewayPaths } from "./paths";
import { GatewayError, type GatewayClient } from "./types";

export type GatewayOperations = {
  listDeviceIds: () => Promise<string[]>;
  getDeviceDetail: (id: string) => Promise<GatewayDeviceDetail>;
  getDeviceState: (id: string) => Promise<GatewayDeviceState>;
  setSwitch: (id: string, on: boolean) => Promise<void>;
  setBrightness: (id: string, brightness: number) => Promise<void>;
};

const jsonPut = (body: unknown): RequestInit => ({
  method: "PUT",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const requirePlainObject = (value: unknown, message: string): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new GatewayError("protocol", message);
  }

  return value as Record<string, unknown>;
};

export const createGatewayOperations = (client: GatewayClient): GatewayOperations => ({
  listDeviceIds: async () => Object.keys(requirePlainObject(await client.call(gatewayPaths.devices), "Invalid devices response")),
  getDeviceDetail: async (id) => requirePlainObject(await client.call(gatewayPaths.device(id)), "Invalid device detail response") as GatewayDeviceDetail,
  getDeviceState: async (id) => requirePlainObject(await client.call(gatewayPaths.deviceState(id)), "Invalid device state response") as GatewayDeviceState,
  setSwitch: async (id, on) => {
    await client.call(gatewayPaths.device(id), jsonPut({ on }));
  },
  setBrightness: async (id, brightness) => {
    await client.call(gatewayPaths.device(id), jsonPut({ brightness }));
  },
});
