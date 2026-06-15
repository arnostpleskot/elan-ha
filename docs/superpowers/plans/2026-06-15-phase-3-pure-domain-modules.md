# Phase 3 Pure Domain Modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pure, tested TypeScript modules for MQTT topics, Home Assistant discovery payloads, RFSA-66M device/channel modeling, queue job constants, and Valkey key helpers.

**Architecture:** This phase adds deterministic helpers only. No MQTT client, BullMQ worker, Valkey connection, RF-003 gateway calls, or runtime side effects are introduced. These modules create stable contracts that later infrastructure phases can consume.

**Tech Stack:** Bun test runner, TypeScript, Home Assistant MQTT Discovery conventions.

---

## File Structure

- Create `src/mqtt/topics.ts`: centralized MQTT topic construction.
- Create `src/mqtt/topics.test.ts`: topic generation tests.
- Create `src/devices/types.ts`: exported device/channel types.
- Create `src/devices/rfsa66m.ts`: RFSA-66M channel helpers.
- Create `src/devices/rfsa66m.test.ts`: RFSA-66M mapping tests.
- Create `src/mqtt/discovery.ts`: Home Assistant switch discovery payload generation.
- Create `src/mqtt/discovery.test.ts`: discovery payload tests.
- Create `src/queue/jobs.ts`: job names, priorities, and payload types.
- Create `src/queue/jobs.test.ts`: queue constants tests.
- Create `src/storage/keys.ts`: Valkey key helpers.
- Create `src/storage/keys.test.ts`: key helper tests.

## Task 1: MQTT Topic Helpers

**Files:**
- Create: `src/mqtt/topics.ts`
- Create: `src/mqtt/topics.test.ts`
- Delete: `src/mqtt/.gitkeep`

- [ ] **Step 1: Write failing tests**

```ts
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
  });

  test("builds bridge runtime topics", () => {
    expect(switchStateTopic("inels", "inels_rfsa66m_1_ch1")).toBe("inels/switch/inels_rfsa66m_1_ch1/state");
    expect(switchCommandTopic("inels", "inels_rfsa66m_1_ch1")).toBe("inels/switch/inels_rfsa66m_1_ch1/set");
    expect(availabilityTopic("inels")).toBe("inels/status");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `bun test src/mqtt/topics.test.ts`

Expected: FAIL because `topics.ts` does not exist.

- [ ] **Step 3: Implement topic helpers**

```ts
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
```

- [ ] **Step 4: Remove placeholder and run checks**

Run: `rm src/mqtt/.gitkeep && bun test src/mqtt/topics.test.ts && bun run typecheck`

Expected: tests and typecheck pass.

- [ ] **Step 5: Commit**

Run: `git add src/mqtt/topics.ts src/mqtt/topics.test.ts src/mqtt/.gitkeep && git commit -m "feat: add mqtt topic helpers"`

Expected: signed commit succeeds. If signing fails, stop and ask; do not bypass signing.

## Task 2: RFSA-66M Device Mapping

**Files:**
- Create: `src/devices/types.ts`
- Create: `src/devices/rfsa66m.ts`
- Create: `src/devices/rfsa66m.test.ts`
- Delete: `src/devices/.gitkeep`

- [ ] **Step 1: Write failing tests**

```ts
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
```

- [ ] **Step 2: Run test to verify failure**

Run: `bun test src/devices/rfsa66m.test.ts`

Expected: FAIL because implementation files do not exist.

- [ ] **Step 3: Implement types**

```ts
export type SwitchChannel = {
  deviceId: string;
  deviceIndex: number;
  channel: number;
  name: string;
  objectId: string;
};

export type Rfsa66mDevice = {
  id: string;
  index: number;
  name: string;
  channels: SwitchChannel[];
};
```

- [ ] **Step 4: Implement RFSA-66M helpers**

```ts
import type { Rfsa66mDevice, SwitchChannel } from "./types";

const RFSA66M_CHANNEL_COUNT = 6;

export const rfsa66mObjectId = (deviceIndex: number, channel: number): string =>
  `inels_rfsa66m_${deviceIndex}_ch${channel}`;

type CreateChannelsInput = {
  deviceIndex: number;
  deviceId: string;
  name: string;
};

export const createRfsa66mChannels = ({ deviceIndex, deviceId, name }: CreateChannelsInput): SwitchChannel[] =>
  Array.from({ length: RFSA66M_CHANNEL_COUNT }, (_, index) => {
    const channel = index + 1;

    return {
      deviceId,
      deviceIndex,
      channel,
      name: `${name} Channel ${channel}`,
      objectId: rfsa66mObjectId(deviceIndex, channel),
    };
  });

export const createRfsa66mDevices = (count: number): Rfsa66mDevice[] =>
  Array.from({ length: count }, (_, index) => {
    const deviceIndex = index + 1;
    const id = `rfsa66m_${deviceIndex}`;
    const name = `RFSA-66M ${deviceIndex}`;

    return {
      id,
      index: deviceIndex,
      name,
      channels: createRfsa66mChannels({ deviceIndex, deviceId: id, name }),
    };
  });
```

- [ ] **Step 5: Remove placeholder and run checks**

Run: `rm src/devices/.gitkeep && bun test src/devices/rfsa66m.test.ts && bun run typecheck`

Expected: tests and typecheck pass.

- [ ] **Step 6: Commit**

Run: `git add src/devices/types.ts src/devices/rfsa66m.ts src/devices/rfsa66m.test.ts src/devices/.gitkeep && git commit -m "feat: add rfsa66m device mapping"`

Expected: signed commit succeeds. If signing fails, stop and ask; do not bypass signing.

## Task 3: Home Assistant Discovery Payloads

**Files:**
- Create: `src/mqtt/discovery.ts`
- Create: `src/mqtt/discovery.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
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
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `bun test src/mqtt/discovery.test.ts`

Expected: FAIL because `discovery.ts` does not exist.

- [ ] **Step 3: Implement discovery helper**

```ts
import type { SwitchChannel } from "../devices/types";
import { availabilityTopic, switchCommandTopic, switchStateTopic } from "./topics";

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

export const buildSwitchDiscoveryPayload = ({ baseTopic, channel }: BuildSwitchDiscoveryPayloadInput): SwitchDiscoveryPayload => ({
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
    via_device: "inels_bridge",
  },
});
```

- [ ] **Step 4: Run checks**

Run: `bun test src/mqtt/discovery.test.ts && bun run typecheck`

Expected: tests and typecheck pass.

- [ ] **Step 5: Commit**

Run: `git add src/mqtt/discovery.ts src/mqtt/discovery.test.ts && git commit -m "feat: add mqtt discovery payloads"`

Expected: signed commit succeeds. If signing fails, stop and ask; do not bypass signing.

## Task 4: Queue Job Contracts

**Files:**
- Create: `src/queue/jobs.ts`
- Create: `src/queue/jobs.test.ts`
- Delete: `src/queue/.gitkeep`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, test } from "bun:test";
import { GatewayJobName, JobPriority } from "./jobs";

describe("queue jobs", () => {
  test("defines stable job names", () => {
    expect(GatewayJobName.SetOutput).toBe("command.set_output");
    expect(GatewayJobName.PollFullState).toBe("poll.full_state");
    expect(GatewayJobName.PollDeviceState).toBe("poll.device_state");
    expect(GatewayJobName.PublishDiscovery).toBe("discovery.publish");
  });

  test("prioritizes commands before polling and discovery", () => {
    expect(JobPriority.Command).toBeLessThan(JobPriority.Poll);
    expect(JobPriority.Poll).toBeLessThan(JobPriority.Discovery);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `bun test src/queue/jobs.test.ts`

Expected: FAIL because `jobs.ts` does not exist.

- [ ] **Step 3: Implement job contracts**

```ts
export const GatewayJobName = {
  SetOutput: "command.set_output",
  PollFullState: "poll.full_state",
  PollDeviceState: "poll.device_state",
  PublishDiscovery: "discovery.publish",
} as const;

export type GatewayJobName = (typeof GatewayJobName)[keyof typeof GatewayJobName];

export const JobPriority = {
  Command: 1,
  Poll: 10,
  Discovery: 20,
} as const;

export type SetOutputJob = {
  name: typeof GatewayJobName.SetOutput;
  data: {
    deviceId: string;
    channel: number;
    state: "ON" | "OFF";
  };
};

export type PollFullStateJob = {
  name: typeof GatewayJobName.PollFullState;
  data: Record<string, never>;
};

export type PollDeviceStateJob = {
  name: typeof GatewayJobName.PollDeviceState;
  data: {
    deviceId: string;
  };
};

export type PublishDiscoveryJob = {
  name: typeof GatewayJobName.PublishDiscovery;
  data: Record<string, never>;
};

export type GatewayJob = SetOutputJob | PollFullStateJob | PollDeviceStateJob | PublishDiscoveryJob;
```

- [ ] **Step 4: Remove placeholder and run checks**

Run: `rm src/queue/.gitkeep && bun test src/queue/jobs.test.ts && bun run typecheck`

Expected: tests and typecheck pass.

- [ ] **Step 5: Commit**

Run: `git add src/queue/jobs.ts src/queue/jobs.test.ts src/queue/.gitkeep && git commit -m "feat: add queue job contracts"`

Expected: signed commit succeeds. If signing fails, stop and ask; do not bypass signing.

## Task 5: Valkey Key Helpers

**Files:**
- Create: `src/storage/keys.ts`
- Create: `src/storage/keys.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, test } from "bun:test";
import { deviceRegistryKey, lastPollKey, lastSuccessKey, stateKey } from "./keys";

describe("storage keys", () => {
  test("builds stable Valkey keys", () => {
    expect(deviceRegistryKey()).toBe("inels:devices");
    expect(stateKey("rfsa66m_1", 2)).toBe("inels:state:rfsa66m_1:2");
    expect(lastPollKey()).toBe("inels:meta:last_poll");
    expect(lastSuccessKey()).toBe("inels:meta:last_success");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `bun test src/storage/keys.test.ts`

Expected: FAIL because `keys.ts` does not exist.

- [ ] **Step 3: Implement key helpers**

```ts
const PREFIX = "inels";

export const deviceRegistryKey = (): string => `${PREFIX}:devices`;

export const stateKey = (deviceId: string, channel: number): string => `${PREFIX}:state:${deviceId}:${channel}`;

export const lastPollKey = (): string => `${PREFIX}:meta:last_poll`;

export const lastSuccessKey = (): string => `${PREFIX}:meta:last_success`;
```

- [ ] **Step 4: Run checks**

Run: `bun test src/storage/keys.test.ts && bun run typecheck`

Expected: tests and typecheck pass.

- [ ] **Step 5: Commit**

Run: `git add src/storage/keys.ts src/storage/keys.test.ts && git commit -m "feat: add storage key helpers"`

Expected: signed commit succeeds. If signing fails, stop and ask; do not bypass signing.

## Task 6: Phase 3 Verification

**Files:**
- Verify all Phase 3 files.

- [ ] **Step 1: Run full checks**

Run: `bun test && bun run typecheck && bun run build`

Expected: all pass.

- [ ] **Step 2: Verify no runtime scope creep**

Run: `git diff --name-only main...HEAD`

Expected: only files under `src/mqtt`, `src/devices`, `src/queue`, `src/storage`, and this plan file changed.

- [ ] **Step 3: Check repository status**

Run: `git status --short`

Expected: clean.

## Phase 3 Completion Criteria

- MQTT topic helpers produce Home Assistant discovery and bridge command/state topics.
- RFSA-66M helpers produce 24 channels for 4 devices.
- Discovery payload helper produces retained-message-ready Home Assistant switch payloads.
- Queue job names and priorities are centralized.
- Valkey key helpers are centralized.
- `bun test`, `bun run typecheck`, and `bun run build` pass.
- No runtime MQTT, BullMQ, Valkey, or RF-003 side effects are added.
