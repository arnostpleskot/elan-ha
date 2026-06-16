import { describe, expect, test } from "bun:test";
import type { DiscoveredEntity } from "../devices/types";
import { buildDiscoveryPayload } from "./discovery";

describe("MQTT discovery", () => {
  test("builds Home Assistant switch discovery payload", () => {
    const entity: DiscoveredEntity = {
      id: "09354",
      sourceId: "09354",
      sourceAddress: 9354,
      kind: "switch",
      capability: "on_off",
      name: "Strop - Chodba",
      productType: "RFSA-66M",
      rf003Type: "light",
      objectId: "inels_9354",
    };

    expect(buildDiscoveryPayload({ baseTopic: "inels", bridgeName: "iNELS Bridge", entity })).toMatchObject({
      name: "Strop - Chodba",
      unique_id: "inels_9354",
      object_id: "inels_9354",
      command_topic: "inels/switch/inels_9354/set",
      state_topic: "inels/switch/inels_9354/state",
      availability_topic: "inels/status",
      payload_available: "online",
      payload_not_available: "offline",
      device: { identifiers: ["inels_9354"], model: "RFSA-66M", name: "Strop - Chodba" },
    });
  });

  test("builds Home Assistant dimmable light discovery payload", () => {
    const entity: DiscoveredEntity = {
      id: "47742",
      sourceId: "47742",
      sourceAddress: 47742,
      kind: "light",
      capability: "brightness",
      capabilities: ["brightness"],
      name: "Strop - Loznice",
      productType: "RFDA-71B",
      rf003Type: "dimmed light",
      objectId: "inels_47742",
      brightness: { min: 0, max: 100, step: 10 },
    };

    expect(buildDiscoveryPayload({ baseTopic: "inels", bridgeName: "iNELS Bridge", entity })).toMatchObject({
      name: "Strop - Loznice",
      unique_id: "inels_47742",
      object_id: "inels_47742",
      command_topic: "inels/light/inels_47742/set",
      state_topic: "inels/light/inels_47742/state",
      availability_topic: "inels/status",
      payload_available: "online",
      payload_not_available: "offline",
      schema: "json",
      brightness: true,
      brightness_scale: 255,
      device: { identifiers: ["inels_47742"], model: "RFDA-71B", name: "Strop - Loznice" },
    });
  });

  test("builds Home Assistant on/off light discovery payload", () => {
    const entity: DiscoveredEntity = {
      id: "09356",
      sourceId: "09356",
      sourceAddress: 9356,
      kind: "light",
      capability: "on_off",
      name: "Hall Light",
      productType: "RFSA-66M",
      rf003Type: "light",
      objectId: "inels_09356",
    };

    const payload = buildDiscoveryPayload({ baseTopic: "inels", bridgeName: "iNELS Bridge", entity });

    expect(payload).toMatchObject({
      name: "Hall Light",
      unique_id: "inels_09356",
      object_id: "inels_09356",
      command_topic: "inels/light/inels_09356/set",
      state_topic: "inels/light/inels_09356/state",
      availability_topic: "inels/status",
      payload_available: "online",
      payload_not_available: "offline",
      payload_on: "ON",
      payload_off: "OFF",
      state_on: "ON",
      state_off: "OFF",
      device: { identifiers: ["inels_09356"], model: "RFSA-66M", name: "Hall Light" },
    });
    expect(payload).not.toHaveProperty("schema");
    expect(payload).not.toHaveProperty("brightness");
    expect(payload).not.toHaveProperty("brightness_scale");
  });

  test("builds Home Assistant fan discovery payload", () => {
    const entity: DiscoveredEntity = {
      id: "09355",
      sourceId: "09355",
      sourceAddress: 9355,
      kind: "fan",
      capability: "on_off",
      name: "Bathroom Fan",
      productType: "RFSA-66M",
      rf003Type: "ventilation",
      objectId: "inels_09355",
    };

    expect(buildDiscoveryPayload({ baseTopic: "inels", bridgeName: "iNELS Bridge", entity })).toMatchObject({
      name: "Bathroom Fan",
      unique_id: "inels_09355",
      object_id: "inels_09355",
      command_topic: "inels/fan/inels_09355/set",
      state_topic: "inels/fan/inels_09355/state",
      availability_topic: "inels/status",
      payload_available: "online",
      payload_not_available: "offline",
      payload_on: "ON",
      payload_off: "OFF",
      state_on: "ON",
      state_off: "OFF",
      device: { identifiers: ["inels_09355"], model: "RFSA-66M", name: "Bathroom Fan" },
    });
  });
});
