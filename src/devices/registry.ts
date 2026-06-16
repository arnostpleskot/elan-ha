import type { DiscoveredEntity, GatewayDeviceDetail, GatewayDeviceState } from "./types";

type ClassifyGatewayDeviceInput = {
  id: string;
  detail: GatewayDeviceDetail;
  state: GatewayDeviceState;
};

const fallback = "Unknown";

const hasPrimaryAction = (detail: GatewayDeviceDetail, action: string): boolean =>
  detail["primary actions"]?.includes(action) ?? false;

const deviceName = (id: string, detail: GatewayDeviceDetail): string => detail["device info"]?.label ?? `RF-003 ${id}`;

const productType = (detail: GatewayDeviceDetail): string => detail["device info"]?.["product type"] ?? fallback;

const rf003Type = (detail: GatewayDeviceDetail): string => detail["device info"]?.type ?? fallback;

export const entityObjectId = (id: string): string => `inels_${id}`;

export const classifyGatewayDevice = ({ id, detail, state }: ClassifyGatewayDeviceInput): DiscoveredEntity | undefined => {
  const actions = detail["actions info"] ?? {};

  const brightness = actions.brightness;
  const stateBrightness = state.brightness;
  if (
    hasPrimaryAction(detail, "brightness") &&
    brightness?.type === "int" &&
    (typeof stateBrightness === "number" || stateBrightness === null)
  ) {
    return {
      id,
      kind: "light",
      capabilities: ["brightness"],
      name: deviceName(id, detail),
      productType: productType(detail),
      rf003Type: rf003Type(detail),
      objectId: entityObjectId(id),
      brightness: {
        min: brightness.min ?? 0,
        max: brightness.max ?? 100,
        step: brightness.step ?? 1,
      },
    };
  }

  if (hasPrimaryAction(detail, "on") && actions.on?.type === "bool" && typeof state.on === "boolean") {
    return {
      id,
      kind: "switch",
      name: deviceName(id, detail),
      productType: productType(detail),
      rf003Type: rf003Type(detail),
      objectId: entityObjectId(id),
    };
  }

  return undefined;
};
