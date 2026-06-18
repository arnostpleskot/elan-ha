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

export type EntityCapability = "on_off" | "brightness";

export type BaseEntity = {
  id: string;
  sourceId: string;
  sourceAddress: number;
  name: string;
  productType: string;
  rf003Type: string;
  objectId: string;
};

export type SwitchEntity = BaseEntity & {
  kind: "switch";
  capability: "on_off";
};

export type OnOffLightEntity = BaseEntity & {
  kind: "light";
  capability: "on_off";
};

export type DimmableLightEntity = BaseEntity & {
  kind: "light";
  capability: "brightness";
  capabilities: ["brightness"];
  brightness: { min: number; max: number; step: number };
};

export type FanEntity = BaseEntity & {
  kind: "fan";
  capability: "on_off";
};

export type LightEntity = OnOffLightEntity | DimmableLightEntity;

export type DiscoveredEntity = SwitchEntity | LightEntity | FanEntity;
