import { describe, expect, test } from "bun:test";
import { classifyGatewayDevice } from "./registry";

describe("RF-003 entity registry", () => {
  test("classifies an on bool device as a switch", () => {
    const entity = classifyGatewayDevice({
      id: "09354",
      detail: {
        "device info": { label: "Strop - Chodba", "product type": "RFSA-66M", type: "light" },
        "actions info": { on: { type: "bool" } },
        "primary actions": ["on"],
      },
      state: { on: false },
    });

    expect(entity).toEqual({
      id: "09354",
      kind: "switch",
      name: "Strop - Chodba",
      productType: "RFSA-66M",
      rf003Type: "light",
      objectId: "inels_09354",
    });
  });

  test("classifies a brightness int device as a dimmable light", () => {
    const entity = classifyGatewayDevice({
      id: "47742",
      detail: {
        "device info": { label: "Strop - Loznice", "product type": "RFDA-71B", type: "dimmed light" },
        "actions info": { brightness: { type: "int", min: 0, max: 100, step: 10 } },
        "primary actions": ["brightness"],
      },
      state: { brightness: null },
    });

    expect(entity).toEqual({
      id: "47742",
      kind: "light",
      capabilities: ["brightness"],
      name: "Strop - Loznice",
      productType: "RFDA-71B",
      rf003Type: "dimmed light",
      objectId: "inels_47742",
      brightness: { min: 0, max: 100, step: 10 },
    });
  });

  test("classifies a device with both on and brightness as a dimmable light", () => {
    const entity = classifyGatewayDevice({
      id: "47742",
      detail: {
        "device info": { label: "Strop - Loznice", "product type": "RFDA-71B", type: "dimmed light" },
        "actions info": {
          on: { type: "bool" },
          brightness: { type: "int", min: 0, max: 100, step: 1 },
        },
        "primary actions": ["on", "brightness"],
      },
      state: { on: true, brightness: 42 },
    });

    expect(entity).toMatchObject({
      id: "47742",
      kind: "light",
      capabilities: ["brightness"],
      objectId: "inels_47742",
    });
  });

  test("returns undefined for unsupported action shapes", () => {
    const entity = classifyGatewayDevice({
      id: "12345",
      detail: {
        "device info": { label: "Unsupported", "product type": "RF-OTHER", type: "sensor" },
        "actions info": { temperature: { type: "int", min: 0, max: 50, step: 1 } },
        "primary actions": ["temperature"],
      },
      state: { temperature: 22 },
    });

    expect(entity).toBeUndefined();
  });

  test("preserves leading-zero IDs as strings", () => {
    const entity = classifyGatewayDevice({
      id: "00472",
      detail: {
        "device info": { label: "Leading Zero", "product type": "RFSA-66M", type: "light" },
        "actions info": { on: { type: "bool" } },
        "primary actions": ["on"],
      },
      state: { on: true },
    });

    expect(entity?.id).toBe("00472");
    expect(entity?.objectId).toBe("inels_00472");
  });
});
