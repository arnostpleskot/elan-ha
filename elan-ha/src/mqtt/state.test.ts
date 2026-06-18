import { describe, expect, test } from "bun:test";
import { buildMqttStatePayload, normalizeRf003Brightness } from "./state";

describe("MQTT state conversion", () => {
  test("builds switch state payloads", () => {
    expect(buildMqttStatePayload({ kind: "switch", capability: "on_off", state: { on: true } })).toBe("ON");
    expect(buildMqttStatePayload({ kind: "switch", capability: "on_off", state: { on: false } })).toBe("OFF");
  });

  test("builds fan state payloads", () => {
    expect(buildMqttStatePayload({ kind: "fan", capability: "on_off", state: { on: true } })).toBe("ON");
    expect(buildMqttStatePayload({ kind: "fan", capability: "on_off", state: { on: false } })).toBe("OFF");
  });

  test("builds on/off light state payloads", () => {
    expect(buildMqttStatePayload({ kind: "light", capability: "on_off", state: { on: true } })).toBe("ON");
    expect(buildMqttStatePayload({ kind: "light", capability: "on_off", state: { on: false } })).toBe("OFF");
  });

  test("throws when switch state is missing on", () => {
    expect(() => buildMqttStatePayload({ kind: "switch", capability: "on_off", state: {} })).toThrow(
      "Missing boolean switch state: on",
    );
  });

  test("builds light state payloads with RF-003 native brightness", () => {
    expect(buildMqttStatePayload({ kind: "light", capability: "brightness", state: { brightness: 50 } })).toBe(
      JSON.stringify({ state: "ON", brightness: 50 }),
    );
  });

  test("skips light state when RF-003 brightness is null", () => {
    expect(buildMqttStatePayload({ kind: "light", capability: "brightness", state: { brightness: null } })).toBeUndefined();
  });

  test("throws when light state is missing brightness", () => {
    expect(() => buildMqttStatePayload({ kind: "light", capability: "brightness", state: {} })).toThrow(
      "Missing light state: brightness",
    );
  });

  test("throws when light brightness is not finite", () => {
    expect(() =>
      buildMqttStatePayload({ kind: "light", capability: "brightness", state: { brightness: Number.NaN } }),
    ).toThrow("Invalid light state: brightness");
  });

  test("normalizes RF-003 brightness boundaries", () => {
    expect(normalizeRf003Brightness(0)).toBe(0);
    expect(normalizeRf003Brightness(100)).toBe(100);
  });

  test("clamps RF-003 brightness inputs", () => {
    expect(normalizeRf003Brightness(-1)).toBe(0);
    expect(normalizeRf003Brightness(101)).toBe(100);
    expect(normalizeRf003Brightness(1)).toBe(1);
  });

  test("throws when brightness conversion input is not finite", () => {
    expect(() => normalizeRf003Brightness(Number.NaN)).toThrow("Invalid RF-003 brightness");
  });
});
