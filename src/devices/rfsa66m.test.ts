import { describe, expect, test } from "bun:test";
import { createRfsa66mChannels, createRfsa66mDevices, rfsa66mObjectId } from "./rfsa66m";

describe("RFSA-66M mapping", () => {
  test("creates six channels per relay module", () => {
    const channels = createRfsa66mChannels({ deviceIndex: 1, deviceId: "rfsa66m_1", name: "Relay Module 1" });

    expect(channels).toHaveLength(6);
    expect(channels[0]).toEqual({
      deviceId: "rfsa66m_1",
      deviceIndex: 1,
      channel: 1,
      name: "Relay Module 1 Channel 1",
      objectId: "inels_rfsa66m_1_ch1",
    });
  });

  test("creates the target 24 channels across four modules", () => {
    const devices = createRfsa66mDevices(4);
    const totalChannels = devices.flatMap((device) => device.channels);

    expect(devices).toHaveLength(4);
    expect(totalChannels).toHaveLength(24);
    expect(totalChannels.at(-1)?.objectId).toBe("inels_rfsa66m_4_ch6");
  });

  test("builds stable object ids", () => {
    expect(rfsa66mObjectId(2, 5)).toBe("inels_rfsa66m_2_ch5");
  });
});
