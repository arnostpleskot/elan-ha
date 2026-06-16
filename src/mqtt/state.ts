import type { EntityCapability, GatewayDeviceState } from "../devices/types";

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

export const rf003BrightnessToHa = (brightness: number): number => {
  if (!Number.isFinite(brightness)) {
    throw new Error("Invalid RF-003 brightness");
  }

  return Math.round((clamp(brightness, 0, 100) / 100) * 255);
};

export const haBrightnessToRf003 = (brightness: number): number => {
  if (!Number.isFinite(brightness)) {
    throw new Error("Invalid Home Assistant brightness");
  }

  const clampedBrightness = clamp(brightness, 0, 255);
  const convertedBrightness = Math.round((clampedBrightness / 255) * 100);

  return clampedBrightness > 0 ? Math.max(convertedBrightness, 1) : 0;
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

  return JSON.stringify({ state: state.brightness > 0 ? "ON" : "OFF", brightness: rf003BrightnessToHa(state.brightness) });
};
