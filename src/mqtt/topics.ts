export const normalizeTopicSegment = (value: string): string =>
  value.trim() === "+"
    ? "+"
    : value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");

const trimTopicBoundary = (value: string): string => value.trim().replace(/^\/+|\/+$/g, "");

const joinTopic = (...segments: string[]): string => segments.map(trimTopicBoundary).filter(Boolean).join("/");

export const switchDiscoveryTopic = (discoveryPrefix: string, objectId: string): string =>
  joinTopic(discoveryPrefix, "switch", normalizeTopicSegment(objectId), "config");

export const switchStateTopic = (baseTopic: string, objectId: string): string =>
  joinTopic(baseTopic, "switch", normalizeTopicSegment(objectId), "state");

export const switchCommandTopic = (baseTopic: string, objectId: string): string =>
  joinTopic(baseTopic, "switch", normalizeTopicSegment(objectId), "set");

export const lightDiscoveryTopic = (discoveryPrefix: string, objectId: string): string =>
  joinTopic(discoveryPrefix, "light", normalizeTopicSegment(objectId), "config");

export const lightStateTopic = (baseTopic: string, objectId: string): string =>
  joinTopic(baseTopic, "light", normalizeTopicSegment(objectId), "state");

export const lightCommandTopic = (baseTopic: string, objectId: string): string =>
  joinTopic(baseTopic, "light", normalizeTopicSegment(objectId), "set");

export const availabilityTopic = (baseTopic: string): string => joinTopic(baseTopic, "status");
