import type { GatewayDeviceState } from "../devices/types";

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

export const rf003BrightnessToHa = (brightness: number): number => Math.round((clamp(brightness, 0, 100) / 100) * 255);

export const haBrightnessToRf003 = (brightness: number): number => {
  const clampedBrightness = clamp(brightness, 0, 255);
  const convertedBrightness = Math.round((clampedBrightness / 255) * 100);

  return clampedBrightness > 0 ? Math.max(convertedBrightness, 1) : 0;
};

export const buildMqttStatePayload = ({
  kind,
  state,
}: {
  kind: "switch" | "light";
  state: GatewayDeviceState;
}): string => {
  if (kind === "switch") {
    if (typeof state.on !== "boolean") {
      throw new Error("Missing boolean switch state: on");
    }

    return state.on === true ? "ON" : "OFF";
  }

  if (!("brightness" in state)) {
    throw new Error("Missing light state: brightness");
  }

  if (state.brightness === null) {
    return JSON.stringify({ state: "OFF" });
  }

  if (typeof state.brightness !== "number") {
    throw new Error("Missing light state: brightness");
  }

  return JSON.stringify({ state: state.brightness > 0 ? "ON" : "OFF", brightness: rf003BrightnessToHa(state.brightness) });
};
