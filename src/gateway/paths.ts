export type GatewayPath =
  | "devices"
  | `devices/${string}`
  | `devices/${string}/state`;

export const gatewayPaths = {
  devices: "devices" as const,
  device: (id: string): GatewayPath => `devices/${id}`,
  deviceState: (id: string): GatewayPath => `devices/${id}/state`,
};
