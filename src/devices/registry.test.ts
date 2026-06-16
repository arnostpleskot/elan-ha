import { describe, expect, test } from "bun:test";
import { classifyGatewayDevice } from "./registry";

describe("RF-003 entity registry", () => {
  test("maps ventilation with on bool to a fan", () => {
    const entity = classifyGatewayDevice({
      id: "09354",
      detail: {
        "device info": { label: "Bathroom Fan", "product type": "RFSA-66M", type: "ventilation", address: 12345 },
        "actions info": { on: { type: "bool" } },
        "primary actions": ["on"],
      },
      state: { on: false },
    });

    expect(entity).toEqual({
      id: "09354",
      sourceId: "09354",
      sourceAddress: 12345,
      kind: "fan",
      capability: "on_off",
      name: "Bathroom Fan",
      productType: "RFSA-66M",
      rf003Type: "ventilation",
      objectId: "inels_12345",
    });
  });

  test("maps light with on bool to an on/off light", () => {
    const entity = classifyGatewayDevice({
      id: "09354",
      detail: {
        "device info": { label: "Hall Light", "product type": "RFSA-66M", type: "light", address: 12346 },
        "actions info": { on: { type: "bool" } },
        "primary actions": ["on"],
      },
      state: { on: true },
    });

    expect(entity).toMatchObject({
      id: "09354",
      sourceId: "09354",
      sourceAddress: 12346,
      kind: "light",
      capability: "on_off",
      objectId: "inels_12346",
    });
    expect(entity).not.toHaveProperty("brightness");
  });

  test("maps lamp with on bool to an on/off light", () => {
    const entity = classifyGatewayDevice({
      id: "09355",
      detail: {
        "device info": { label: "Table Lamp", "product type": "RFSA-66M", type: "lamp", address: 12347 },
        "actions info": { on: { type: "bool" } },
        "primary actions": ["on"],
      },
      state: { on: false },
    });

    expect(entity).toMatchObject({ kind: "light", capability: "on_off", objectId: "inels_12347" });
  });

  test("maps dimmed light with brightness int to a dimmable light", () => {
    const entity = classifyGatewayDevice({
      id: "47742",
      detail: {
        "device info": { label: "Bedroom Ceiling", "product type": "RFDA-71B", type: "dimmed light", address: 47742 },
        "actions info": { brightness: { type: "int", min: 0, max: 100, step: 10 } },
        "primary actions": ["brightness"],
      },
      state: { brightness: null },
    });

    expect(entity).toEqual({
      id: "47742",
      sourceId: "47742",
      sourceAddress: 47742,
      kind: "light",
      capability: "brightness",
      capabilities: ["brightness"],
      name: "Bedroom Ceiling",
      productType: "RFDA-71B",
      rf003Type: "dimmed light",
      objectId: "inels_47742",
      brightness: { min: 0, max: 100, step: 10 },
    });
  });

  test("falls back unknown on bool devices to switch", () => {
    const entity = classifyGatewayDevice({
      id: "22222",
      detail: {
        "device info": { label: "Generic Relay", "product type": "RFSA-66M", type: "unknown", address: 22222 },
        "actions info": { on: { type: "bool" } },
        "primary actions": ["on"],
      },
      state: { on: true },
    });

    expect(entity).toMatchObject({ kind: "switch", capability: "on_off", objectId: "inels_22222" });
  });

  test("falls back unknown brightness devices to light", () => {
    const entity = classifyGatewayDevice({
      id: "33333",
      detail: {
        "device info": { label: "Generic Dimmer", "product type": "RFDA-71B", type: "unknown", address: 33333 },
        "actions info": { brightness: { type: "int" } },
        "primary actions": ["brightness"],
      },
      state: { brightness: 50 },
    });

    expect(entity).toMatchObject({ kind: "light", capability: "brightness", objectId: "inels_33333" });
  });

  test("preserves leading-zero IDs for gateway API calls while using address for HA identity", () => {
    const entity = classifyGatewayDevice({
      id: "00472",
      detail: {
        "device info": { label: "Leading Zero", "product type": "RFSA-66M", type: "light", address: 472 },
        "actions info": { on: { type: "bool" } },
        "primary actions": ["on"],
      },
      state: { on: true },
    });

    expect(entity?.id).toBe("00472");
    expect(entity?.sourceId).toBe("00472");
    expect(entity?.sourceAddress).toBe(472);
    expect(entity?.objectId).toBe("inels_472");
  });

  test("returns undefined when RF-003 address is missing", () => {
    const entity = classifyGatewayDevice({
      id: "12345",
      detail: {
        "device info": { label: "No Address", "product type": "RFSA-66M", type: "light" },
        "actions info": { on: { type: "bool" } },
        "primary actions": ["on"],
      },
      state: { on: true },
    });

    expect(entity).toBeUndefined();
  });

  test("returns undefined for unsupported action shapes", () => {
    const entity = classifyGatewayDevice({
      id: "12345",
      detail: {
        "device info": { label: "Unsupported", "product type": "RF-OTHER", type: "sensor", address: 12345 },
        "actions info": { temperature: { type: "int", min: 0, max: 50, step: 1 } },
        "primary actions": ["temperature"],
      },
      state: { temperature: 22 },
    });

    expect(entity).toBeUndefined();
  });
});
