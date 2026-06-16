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

export const entityObjectId = (sourceAddress: number): string => `inels_${sourceAddress}`;

const normalizedSemanticType = (detail: GatewayDeviceDetail): string => rf003Type(detail).trim().toLowerCase();

const baseEntity = (id: string, detail: GatewayDeviceDetail) => {
  const sourceAddress = detail["device info"]?.address;
  if (typeof sourceAddress !== "number" || !Number.isInteger(sourceAddress) || sourceAddress < 0) {
    return undefined;
  }

  return {
    id,
    sourceId: id,
    sourceAddress,
    name: deviceName(id, detail),
    productType: productType(detail),
    rf003Type: rf003Type(detail),
    objectId: entityObjectId(sourceAddress),
  };
};

const onOffDomain = (semanticType: string): "switch" | "light" | "fan" | undefined => {
  if (semanticType === "light" || semanticType === "lamp") {
    return "light";
  }
  if (semanticType === "ventilation") {
    return "fan";
  }
  if (semanticType === fallback.toLowerCase() || semanticType === "unknown" || semanticType === "") {
    return "switch";
  }
  return "switch";
};

export const classifyGatewayDevice = ({ id, detail, state }: ClassifyGatewayDeviceInput): DiscoveredEntity | undefined => {
  const actions = detail["actions info"] ?? {};
  const base = baseEntity(id, detail);
  if (base === undefined) {
    return undefined;
  }

  const brightness = actions.brightness;
  const stateBrightness = state.brightness;
  if (
    hasPrimaryAction(detail, "brightness") &&
    brightness?.type === "int" &&
    (typeof stateBrightness === "number" || stateBrightness === null)
  ) {
    return {
      ...base,
      kind: "light",
      capability: "brightness",
      capabilities: ["brightness"],
      brightness: {
        min: brightness.min ?? 0,
        max: brightness.max ?? 100,
        step: brightness.step ?? 1,
      },
    };
  }

  if (hasPrimaryAction(detail, "on") && actions.on?.type === "bool" && typeof state.on === "boolean") {
    const domain = onOffDomain(normalizedSemanticType(detail));
    if (domain === undefined) {
      return undefined;
    }

    return { ...base, kind: domain, capability: "on_off" };
  }

  return undefined;
};
