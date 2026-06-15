import type { SwitchChannel } from "../devices/types";
import { availabilityTopic, normalizeTopicSegment, switchCommandTopic, switchStateTopic } from "./topics";

export type SwitchDiscoveryPayload = {
  name: string;
  unique_id: string;
  object_id: string;
  command_topic: string;
  state_topic: string;
  availability_topic: string;
  payload_on: "ON";
  payload_off: "OFF";
  state_on: "ON";
  state_off: "OFF";
  device: {
    identifiers: string[];
    manufacturer: "ELKO EP";
    model: "RFSA-66M";
    name: string;
    via_device: string;
  };
};

type BuildSwitchDiscoveryPayloadInput = {
  baseTopic: string;
  bridgeName: string;
  channel: SwitchChannel;
};

export const buildSwitchDiscoveryPayload = ({ baseTopic, bridgeName, channel }: BuildSwitchDiscoveryPayloadInput): SwitchDiscoveryPayload => ({
  name: channel.name,
  unique_id: channel.objectId,
  object_id: channel.objectId,
  command_topic: switchCommandTopic(baseTopic, channel.objectId),
  state_topic: switchStateTopic(baseTopic, channel.objectId),
  availability_topic: availabilityTopic(baseTopic),
  payload_on: "ON",
  payload_off: "OFF",
  state_on: "ON",
  state_off: "OFF",
  device: {
    identifiers: [`inels_${channel.deviceId}`],
    manufacturer: "ELKO EP",
    model: "RFSA-66M",
    name: `RFSA-66M ${channel.deviceIndex}`,
    via_device: normalizeTopicSegment(bridgeName),
  },
});
