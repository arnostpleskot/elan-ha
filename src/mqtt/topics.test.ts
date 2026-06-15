import { describe, expect, test } from "bun:test";
import {
  availabilityTopic,
  normalizeTopicSegment,
  switchCommandTopic,
  switchDiscoveryTopic,
  switchStateTopic,
} from "./topics";

describe("mqtt topics", () => {
  test("normalizes topic segments", () => {
    expect(normalizeTopicSegment("RFSA 66M #1 / Ch 1")).toBe("rfsa_66m_1_ch_1");
  });

  test("builds Home Assistant discovery topic", () => {
    expect(switchDiscoveryTopic("homeassistant", "inels_rfsa66m_1_ch1")).toBe(
      "homeassistant/switch/inels_rfsa66m_1_ch1/config",
    );
    expect(switchDiscoveryTopic("ha/discovery", "Inels RFSA 1 Ch1")).toBe(
      "ha/discovery/switch/inels_rfsa_1_ch1/config",
    );
  });

  test("builds bridge runtime topics", () => {
    expect(switchStateTopic("inels", "inels_rfsa66m_1_ch1")).toBe("inels/switch/inels_rfsa66m_1_ch1/state");
    expect(switchStateTopic("Site/Inels", "Inels RFSA 1 Ch1")).toBe("Site/Inels/switch/inels_rfsa_1_ch1/state");
    expect(switchCommandTopic("inels", "inels_rfsa66m_1_ch1")).toBe("inels/switch/inels_rfsa66m_1_ch1/set");
    expect(availabilityTopic("inels")).toBe("inels/status");
  });
});
