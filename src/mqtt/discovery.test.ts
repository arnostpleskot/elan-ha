import { describe, expect, test } from "bun:test";
import { buildSwitchDiscoveryPayload } from "./discovery";

describe("MQTT discovery", () => {
  test("builds Home Assistant switch discovery payload", () => {
    const payload = buildSwitchDiscoveryPayload({
      baseTopic: "inels",
      bridgeName: "iNELS Bridge",
      channel: {
        deviceId: "rfsa66m_1",
        deviceIndex: 1,
        channel: 1,
        name: "RFSA-66M 1 Channel 1",
        objectId: "inels_rfsa66m_1_ch1",
      },
    });

    expect(payload).toMatchObject({
      name: "RFSA-66M 1 Channel 1",
      unique_id: "inels_rfsa66m_1_ch1",
      object_id: "inels_rfsa66m_1_ch1",
      command_topic: "inels/switch/inels_rfsa66m_1_ch1/set",
      state_topic: "inels/switch/inels_rfsa66m_1_ch1/state",
      availability_topic: "inels/status",
      payload_on: "ON",
      payload_off: "OFF",
      state_on: "ON",
      state_off: "OFF",
      device: {
        identifiers: ["inels_rfsa66m_1"],
        manufacturer: "ELKO EP",
        model: "RFSA-66M",
        name: "RFSA-66M 1",
        via_device: "inels_bridge",
      },
    });
  });

  test("normalizes bridgeName into via_device", () => {
    const payload = buildSwitchDiscoveryPayload({
      baseTopic: "inels",
      bridgeName: "My Custom Bridge",
      channel: {
        deviceId: "rfsa66m_1",
        deviceIndex: 1,
        channel: 1,
        name: "RFSA-66M 1 Channel 1",
        objectId: "inels_rfsa66m_1_ch1",
      },
    });

    expect(payload.device.via_device).toBe("my_custom_bridge");
  });

  test("preserves configured topic prefixes and normalizes object ids in topics", () => {
    const payload = buildSwitchDiscoveryPayload({
      baseTopic: "Bridge/Runtime Prefix",
      bridgeName: "iNELS Bridge",
      channel: {
        deviceId: "rfsa66m_1",
        deviceIndex: 1,
        channel: 1,
        name: "RFSA-66M 1 Channel 1",
        objectId: "RFSA 66M #1 / Ch 1",
      },
    });

    expect(payload.command_topic).toBe("Bridge/Runtime Prefix/switch/rfsa_66m_1_ch_1/set");
    expect(payload.state_topic).toBe("Bridge/Runtime Prefix/switch/rfsa_66m_1_ch_1/state");
    expect(payload.availability_topic).toBe("Bridge/Runtime Prefix/status");
  });
});
