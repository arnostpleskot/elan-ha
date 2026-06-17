import type { DiscoveredEntity } from "../devices/types";
import {
  availabilityTopic,
  fanCommandTopic,
  fanStateTopic,
  lightCommandTopic,
  lightStateTopic,
  switchCommandTopic,
  switchStateTopic,
} from "./topics";

type DiscoveryInput = {
  baseTopic: string;
  bridgeName: string;
  entity: DiscoveredEntity;
};

const deviceBlock = (entity: DiscoveredEntity) => ({
  identifiers: [entity.objectId],
  manufacturer: "ELKO EP" as const,
  model: entity.productType,
  name: entity.name,
});

export const buildDiscoveryPayload = ({ baseTopic, entity }: DiscoveryInput) => {
  if (entity.kind === "switch") {
    return {
      name: entity.name,
      unique_id: entity.objectId,
      object_id: entity.objectId,
      command_topic: switchCommandTopic(baseTopic, entity.objectId),
      state_topic: switchStateTopic(baseTopic, entity.objectId),
      availability_topic: availabilityTopic(baseTopic),
      payload_available: "online" as const,
      payload_not_available: "offline" as const,
      payload_on: "ON" as const,
      payload_off: "OFF" as const,
      state_on: "ON" as const,
      state_off: "OFF" as const,
      device: deviceBlock(entity),
    };
  }

  if (entity.kind === "fan") {
    return {
      name: entity.name,
      unique_id: entity.objectId,
      object_id: entity.objectId,
      command_topic: fanCommandTopic(baseTopic, entity.objectId),
      state_topic: fanStateTopic(baseTopic, entity.objectId),
      availability_topic: availabilityTopic(baseTopic),
      payload_available: "online" as const,
      payload_not_available: "offline" as const,
      payload_on: "ON" as const,
      payload_off: "OFF" as const,
      state_on: "ON" as const,
      state_off: "OFF" as const,
      device: deviceBlock(entity),
    };
  }

  if (entity.capability === "on_off") {
    return {
      name: entity.name,
      unique_id: entity.objectId,
      object_id: entity.objectId,
      command_topic: lightCommandTopic(baseTopic, entity.objectId),
      state_topic: lightStateTopic(baseTopic, entity.objectId),
      availability_topic: availabilityTopic(baseTopic),
      payload_available: "online" as const,
      payload_not_available: "offline" as const,
      payload_on: "ON" as const,
      payload_off: "OFF" as const,
      state_on: "ON" as const,
      state_off: "OFF" as const,
      device: deviceBlock(entity),
    };
  }

  return {
    name: entity.name,
    unique_id: entity.objectId,
    object_id: entity.objectId,
    command_topic: lightCommandTopic(baseTopic, entity.objectId),
    state_topic: lightStateTopic(baseTopic, entity.objectId),
    availability_topic: availabilityTopic(baseTopic),
    payload_available: "online" as const,
    payload_not_available: "offline" as const,
    schema: "json" as const,
    brightness: true,
    brightness_scale: entity.brightness.max,
    device: deviceBlock(entity),
  };
};
