export const normalizeTopicSegment = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const joinTopic = (...segments: string[]): string => segments.map(normalizeTopicSegment).filter(Boolean).join("/");

export const switchDiscoveryTopic = (discoveryPrefix: string, objectId: string): string =>
  `${joinTopic(discoveryPrefix, "switch", objectId)}/config`;

export const switchStateTopic = (baseTopic: string, objectId: string): string =>
  joinTopic(baseTopic, "switch", objectId, "state");

export const switchCommandTopic = (baseTopic: string, objectId: string): string =>
  joinTopic(baseTopic, "switch", objectId, "set");

export const availabilityTopic = (baseTopic: string): string => joinTopic(baseTopic, "status");
