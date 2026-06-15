import type { GatewayDeviceDetail, GatewayDeviceState } from "../devices/types";
import { gatewayPaths } from "./paths";
import type { GatewayClient } from "./types";

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

export const createGatewayOperations = (client: GatewayClient): GatewayOperations => ({
  listDeviceIds: async () => Object.keys((await client.call(gatewayPaths.devices)) as Record<string, unknown>),
  getDeviceDetail: async (id) => (await client.call(gatewayPaths.device(id))) as GatewayDeviceDetail,
  getDeviceState: async (id) => (await client.call(gatewayPaths.deviceState(id))) as GatewayDeviceState,
  setSwitch: async (id, on) => {
    await client.call(gatewayPaths.device(id), jsonPut({ on }));
  },
  setBrightness: async (id, brightness) => {
    await client.call(gatewayPaths.device(id), jsonPut({ brightness }));
  },
});
