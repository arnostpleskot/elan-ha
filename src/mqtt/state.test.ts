import { describe, expect, test } from "bun:test";
import { buildMqttStatePayload, haBrightnessToRf003, rf003BrightnessToHa } from "./state";

describe("MQTT state conversion", () => {
  test("builds switch state payloads", () => {
    expect(buildMqttStatePayload({ kind: "switch", state: { on: true } })).toBe("ON");
    expect(buildMqttStatePayload({ kind: "switch", state: { on: false } })).toBe("OFF");
  });

  test("throws when switch state is missing on", () => {
    expect(() => buildMqttStatePayload({ kind: "switch", state: {} })).toThrow("Missing boolean switch state: on");
  });

  test("builds light state payloads with converted brightness", () => {
    expect(buildMqttStatePayload({ kind: "light", state: { brightness: 50 } })).toBe(
      JSON.stringify({ state: "ON", brightness: 128 }),
    );
  });

  test("builds light off state when RF-003 brightness is null", () => {
    expect(buildMqttStatePayload({ kind: "light", state: { brightness: null } })).toBe(JSON.stringify({ state: "OFF" }));
  });

  test("throws when light state is missing brightness", () => {
    expect(() => buildMqttStatePayload({ kind: "light", state: {} })).toThrow("Missing light state: brightness");
  });

  test("converts brightness boundaries", () => {
    expect(rf003BrightnessToHa(0)).toBe(0);
    expect(rf003BrightnessToHa(100)).toBe(255);
    expect(haBrightnessToRf003(0)).toBe(0);
    expect(haBrightnessToRf003(255)).toBe(100);
  });

  test("clamps brightness conversion inputs", () => {
    expect(rf003BrightnessToHa(-1)).toBe(0);
    expect(rf003BrightnessToHa(101)).toBe(255);
    expect(haBrightnessToRf003(-1)).toBe(0);
    expect(haBrightnessToRf003(256)).toBe(100);
    expect(haBrightnessToRf003(1)).toBe(1);
  });
});
