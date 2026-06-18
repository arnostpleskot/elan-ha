import type { EntityCapability, GatewayDeviceState } from "../devices/types";

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

export const normalizeRf003Brightness = (brightness: number): number => {
  if (!Number.isFinite(brightness)) {
    throw new Error("Invalid RF-003 brightness");
  }

  return Math.round(clamp(brightness, 0, 100));
};

export const buildMqttStatePayload = ({
  capability,
  kind,
  state,
}: {
  capability: EntityCapability;
  kind: "switch" | "light" | "fan";
  state: GatewayDeviceState;
}): string | undefined => {
  if (capability === "on_off") {
    if (typeof state.on !== "boolean") {
      throw new Error(`Missing boolean ${kind} state: on`);
    }

    return state.on === true ? "ON" : "OFF";
  }

  if (!("brightness" in state)) {
    throw new Error("Missing light state: brightness");
  }

  if (state.brightness === null) {
    return undefined;
  }

  if (typeof state.brightness !== "number") {
    throw new Error("Missing light state: brightness");
  }

  if (!Number.isFinite(state.brightness)) {
    throw new Error("Invalid light state: brightness");
  }

  const brightness = normalizeRf003Brightness(state.brightness);

  return JSON.stringify({ state: brightness > 0 ? "ON" : "OFF", brightness });
};
