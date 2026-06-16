import { describe, expect, test } from "bun:test";
import type { DiscoveredEntity } from "../devices/types";
import { buildDiscoveryPayload } from "./discovery";

describe("MQTT discovery", () => {
  test("builds Home Assistant switch discovery payload", () => {
    const entity: DiscoveredEntity = {
      id: "09354",
      kind: "switch",
      name: "Strop - Chodba",
      productType: "RFSA-66M",
      rf003Type: "light",
      objectId: "inels_09354",
    };

    expect(buildDiscoveryPayload({ baseTopic: "inels", bridgeName: "iNELS Bridge", entity })).toMatchObject({
      name: "Strop - Chodba",
      unique_id: "inels_09354",
      object_id: "inels_09354",
      command_topic: "inels/switch/inels_09354/set",
      state_topic: "inels/switch/inels_09354/state",
      availability_topic: "inels/status",
      payload_available: "online",
      payload_not_available: "offline",
      device: { identifiers: ["inels_09354"], model: "RFSA-66M", name: "Strop - Chodba" },
    });
  });

  test("builds Home Assistant light discovery payload", () => {
    const entity: DiscoveredEntity = {
      id: "47742",
      kind: "light",
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
});
