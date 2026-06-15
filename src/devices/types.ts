export type GatewayActionInfo = {
  type: "bool" | "int" | null;
  min?: number;
  max?: number;
  step?: number;
};

export type GatewayDeviceDetail = {
  id?: string;
  "device info"?: {
    label?: string;
    "product type"?: string;
    type?: string;
    address?: number;
  };
  "actions info"?: Record<string, GatewayActionInfo>;
  "primary actions"?: string[];
};

export type GatewayDeviceState = Record<string, unknown>;

export type SwitchEntity = {
  id: string;
  kind: "switch";
  name: string;
  productType: string;
  rf003Type: string;
  objectId: string;
};

export type LightEntity = {
  id: string;
  kind: "light";
  capabilities: ["brightness"];
  name: string;
  productType: string;
  rf003Type: string;
  objectId: string;
  brightness: { min: number; max: number; step: number };
};

export type DiscoveredEntity = SwitchEntity | LightEntity;
