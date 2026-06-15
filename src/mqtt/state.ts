import type { GatewayDeviceState } from "../devices/types";

export const rf003BrightnessToHa = (brightness: number): number => Math.round((brightness / 100) * 255);

export const haBrightnessToRf003 = (brightness: number): number => Math.round((brightness / 255) * 100);

export const buildMqttStatePayload = ({
  kind,
  state,
}: {
  kind: "switch" | "light";
  state: GatewayDeviceState;
}): string => {
  if (kind === "switch") {
    return state.on === true ? "ON" : "OFF";
  }

  if (typeof state.brightness !== "number") {
    return JSON.stringify({ state: "OFF" });
  }

  return JSON.stringify({ state: state.brightness > 0 ? "ON" : "OFF", brightness: rf003BrightnessToHa(state.brightness) });
};
