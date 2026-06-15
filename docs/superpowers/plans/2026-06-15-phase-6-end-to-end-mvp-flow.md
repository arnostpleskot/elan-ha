# Phase 6 End-to-End MVP Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first end-to-end RF-003 to MQTT flow using only RF-003-discovered switch and dimmable-light entities.

**Architecture:** Add a capability-based entity registry in `src/devices/`, then extend MQTT topics/discovery/state helpers for both switches and lights. Wire commands, polling, discovery, storage, HTTP, and readiness through the existing BullMQ gateway queue with worker concurrency `1`.

**Tech Stack:** Bun, TypeScript, MQTT.js, BullMQ, ioredis/Valkey, Elysia, Pino.

---

## File Structure

- Modify: `src/devices/types.ts` — replace fixed RFSA channel types with RF-003 discovered entity/detail/state types.
- Create: `src/devices/registry.ts` — classify raw RF-003 detail/state into supported entities and normalize object IDs.
- Create: `src/devices/registry.test.ts` — test switch, dimmer, unsupported, and leading-zero ID behavior.
- Delete: `src/devices/rfsa66m.ts` and `src/devices/rfsa66m.test.ts` — remove fixed 6-channel generation once registry tests replace this behavior.
- Modify: `src/mqtt/topics.ts` and `src/mqtt/topics.test.ts` — add light topic helpers and generic entity topic parsing helpers.
- Modify: `src/mqtt/discovery.ts` and `src/mqtt/discovery.test.ts` — generate discovery payloads from `DiscoveredEntity`, including MQTT light discovery.
- Create: `src/mqtt/state.ts` — convert RF-003 switch/light state to MQTT payloads and convert Home Assistant brightness to RF-003 brightness.
- Create: `src/mqtt/state.test.ts` — test switch payloads, light payloads, `null` brightness, and brightness conversion boundaries.
- Modify: `src/storage/keys.ts` and `src/storage/keys.test.ts` — change state keys to `inels:state:<deviceId>`.
- Create: `src/storage/registry.ts` — read/write discovered entity registry JSON in Valkey.
- Create: `src/storage/registry.test.ts` — test registry round trips with a fake Valkey object.
- Modify: `src/queue/jobs.ts` and `src/queue/jobs.test.ts` — add `command.set_brightness` and `discovery.force`, remove channel from set-output jobs.
- Create: `src/gateway/operations.ts` — typed RF-003 operations on top of `GatewayClient.call`.
- Create: `src/gateway/operations.test.ts` — test endpoint paths and PUT payloads with a fake gateway client.
- Modify: `src/queue/worker.ts` and `src/queue/worker.test.ts` — inject gateway/MQTT/storage dependencies and dispatch real job handlers.
- Modify: `src/mqtt/client.ts` — accept an enqueue callback and dispatch switch/light command messages to BullMQ.
- Modify: `src/mqtt/client.test.ts` — mock MQTT.js and test command subscription/dispatch.
- Modify: `src/observability/readiness.ts` and `src/observability/readiness.test.ts` — include RF-003 readiness.
- Modify: `src/http/server.ts` and `src/http/server.test.ts` — add `POST /discovery/force` and `GET /devices`.
- Modify: `src/app/app.ts` — compose gateway session/client/operations, queue, worker, MQTT command dispatch, startup discovery, polling repeat jobs, HTTP deps.

---

### Task 1: Capability-Based Entity Registry

**Files:**
- Modify: `src/devices/types.ts`
- Create: `src/devices/registry.ts`
- Create: `src/devices/registry.test.ts`
- Delete: `src/devices/rfsa66m.ts`
- Delete: `src/devices/rfsa66m.test.ts`

- [ ] **Step 1: Replace device types with RF-003 discovered entity types**

Replace `src/devices/types.ts` with:

```ts
export type GatewayActionInfo = {
  type: "bool" | "int" | null;
  min?: number;
  max?: number;
  step?: number;
};

export type GatewayDeviceDetail = {
  id?: string;
  "device info"?: {
    label?: string;
    "product type"?: string;
    type?: string;
    address?: number;
  };
  "actions info"?: Record<string, GatewayActionInfo>;
  "primary actions"?: string[];
};

export type GatewayDeviceState = Record<string, unknown>;

export type SwitchEntity = {
  id: string;
  kind: "switch";
  name: string;
  productType: string;
  rf003Type: string;
  objectId: string;
};

export type LightEntity = {
  id: string;
  kind: "light";
  capabilities: ["brightness"];
  name: string;
  productType: string;
  rf003Type: string;
  objectId: string;
  brightness: { min: number; max: number; step: number };
};

export type DiscoveredEntity = SwitchEntity | LightEntity;
```

- [ ] **Step 2: Write failing registry classification tests**

Create `src/devices/registry.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { classifyGatewayDevice } from "./registry";

describe("RF-003 entity registry", () => {
  test("classifies an on bool device as a switch", () => {
    const entity = classifyGatewayDevice({
      id: "09354",
      detail: {
        "device info": { label: "Strop - Chodba", "product type": "RFSA-66M", type: "light" },
        "actions info": { on: { type: "bool" } },
        "primary actions": ["on"],
      },
      state: { on: false },
    });

    expect(entity).toEqual({
      id: "09354",
      kind: "switch",
      name: "Strop - Chodba",
      productType: "RFSA-66M",
      rf003Type: "light",
      objectId: "inels_09354",
    });
  });

  test("classifies a brightness int device as a dimmable light", () => {
    const entity = classifyGatewayDevice({
      id: "47742",
      detail: {
        "device info": { label: "Strop - Loznice", "product type": "RFDA-71B", type: "dimmed light" },
        "actions info": { brightness: { type: "int", min: 0, max: 100, step: 10 } },
        "primary actions": ["brightness"],
      },
      state: { brightness: null },
    });

    expect(entity).toEqual({
      id: "47742",
      kind: "light",
      capabilities: ["brightness"],
      name: "Strop - Loznice",
      productType: "RFDA-71B",
      rf003Type: "dimmed light",
      objectId: "inels_47742",
      brightness: { min: 0, max: 100, step: 10 },
    });
  });

  test("returns undefined for unsupported action shapes", () => {
    const entity = classifyGatewayDevice({
      id: "12345",
      detail: {
        "device info": { label: "Unsupported", "product type": "RF-OTHER", type: "sensor" },
        "actions info": { temperature: { type: "int", min: 0, max: 50, step: 1 } },
        "primary actions": ["temperature"],
      },
      state: { temperature: 22 },
    });

    expect(entity).toBeUndefined();
  });

  test("preserves leading-zero IDs as strings", () => {
    const entity = classifyGatewayDevice({
      id: "00472",
      detail: {
        "device info": { label: "Leading Zero", "product type": "RFSA-66M", type: "light" },
        "actions info": { on: { type: "bool" } },
        "primary actions": ["on"],
      },
      state: { on: true },
    });

    expect(entity?.id).toBe("00472");
    expect(entity?.objectId).toBe("inels_00472");
  });
});
```

- [ ] **Step 3: Run registry tests and verify they fail**

Run: `bun test src/devices/registry.test.ts`

Expected: FAIL because `src/devices/registry.ts` does not exist.

- [ ] **Step 4: Implement registry classification**

Create `src/devices/registry.ts`:

```ts
import type { DiscoveredEntity, GatewayDeviceDetail, GatewayDeviceState } from "./types";

type ClassifyGatewayDeviceInput = {
  id: string;
  detail: GatewayDeviceDetail;
  state: GatewayDeviceState;
};

const fallback = "Unknown";

const hasPrimaryAction = (detail: GatewayDeviceDetail, action: string): boolean =>
  detail["primary actions"]?.includes(action) ?? false;

const deviceName = (id: string, detail: GatewayDeviceDetail): string => detail["device info"]?.label ?? `RF-003 ${id}`;

const productType = (detail: GatewayDeviceDetail): string => detail["device info"]?.["product type"] ?? fallback;

const rf003Type = (detail: GatewayDeviceDetail): string => detail["device info"]?.type ?? fallback;

export const entityObjectId = (id: string): string => `inels_${id}`;

export const classifyGatewayDevice = ({ id, detail, state }: ClassifyGatewayDeviceInput): DiscoveredEntity | undefined => {
  const actions = detail["actions info"] ?? {};

  if (hasPrimaryAction(detail, "on") && actions.on?.type === "bool" && typeof state.on === "boolean") {
    return {
      id,
      kind: "switch",
      name: deviceName(id, detail),
      productType: productType(detail),
      rf003Type: rf003Type(detail),
      objectId: entityObjectId(id),
    };
  }

  const brightness = actions.brightness;
  const stateBrightness = state.brightness;
  if (
    hasPrimaryAction(detail, "brightness") &&
    brightness?.type === "int" &&
    (typeof stateBrightness === "number" || stateBrightness === null)
  ) {
    return {
      id,
      kind: "light",
      capabilities: ["brightness"],
      name: deviceName(id, detail),
      productType: productType(detail),
      rf003Type: rf003Type(detail),
      objectId: entityObjectId(id),
      brightness: {
        min: brightness.min ?? 0,
        max: brightness.max ?? 100,
        step: brightness.step ?? 1,
      },
    };
  }

  return undefined;
};
```

- [ ] **Step 5: Remove obsolete fixed RFSA tests/code**

Delete `src/devices/rfsa66m.ts` and `src/devices/rfsa66m.test.ts`. Run `grep` for `createRfsa66m` and remove any remaining imports in the same task.

- [ ] **Step 6: Run tests**

Run: `bun test src/devices/registry.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/devices
git commit -m "feat: classify rf-003 discovered entities"
```

---

### Task 2: MQTT Topics, Discovery Payloads, And State Conversion

**Files:**
- Modify: `src/mqtt/topics.ts`
- Modify: `src/mqtt/topics.test.ts`
- Modify: `src/mqtt/discovery.ts`
- Modify: `src/mqtt/discovery.test.ts`
- Create: `src/mqtt/state.ts`
- Create: `src/mqtt/state.test.ts`

- [ ] **Step 1: Write failing topic tests for light topics**

Add to `src/mqtt/topics.test.ts` imports:

```ts
import {
  lightCommandTopic,
  lightDiscoveryTopic,
  lightStateTopic,
} from "./topics";
```

Add this test:

```ts
test("builds light discovery and runtime topics", () => {
  expect(lightDiscoveryTopic("homeassistant", "inels_47742")).toBe("homeassistant/light/inels_47742/config");
  expect(lightStateTopic("inels", "inels_47742")).toBe("inels/light/inels_47742/state");
  expect(lightCommandTopic("inels", "inels_47742")).toBe("inels/light/inels_47742/set");
});
```

- [ ] **Step 2: Run topic tests and verify they fail**

Run: `bun test src/mqtt/topics.test.ts`

Expected: FAIL because the light topic helpers are not exported.

- [ ] **Step 3: Implement light topic helpers**

Add to `src/mqtt/topics.ts`:

```ts
export const lightDiscoveryTopic = (discoveryPrefix: string, objectId: string): string =>
  joinTopic(discoveryPrefix, "light", normalizeTopicSegment(objectId), "config");

export const lightStateTopic = (baseTopic: string, objectId: string): string =>
  joinTopic(baseTopic, "light", normalizeTopicSegment(objectId), "state");

export const lightCommandTopic = (baseTopic: string, objectId: string): string =>
  joinTopic(baseTopic, "light", normalizeTopicSegment(objectId), "set");
```

- [ ] **Step 4: Replace discovery tests with entity-based switch and light tests**

Replace `src/mqtt/discovery.test.ts` with:

```ts
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
      schema: "json",
      brightness: true,
      brightness_scale: 255,
      device: { identifiers: ["inels_47742"], model: "RFDA-71B", name: "Strop - Loznice" },
    });
  });
});
```

- [ ] **Step 5: Implement entity discovery payloads**

Replace `src/mqtt/discovery.ts` with:

```ts
import type { DiscoveredEntity } from "../devices/types";
import {
  availabilityTopic,
  lightCommandTopic,
  lightStateTopic,
  normalizeTopicSegment,
  switchCommandTopic,
  switchStateTopic,
} from "./topics";

type DiscoveryInput = {
  baseTopic: string;
  bridgeName: string;
  entity: DiscoveredEntity;
};

const deviceBlock = (bridgeName: string, entity: DiscoveredEntity) => ({
  identifiers: [`inels_${entity.id}`],
  manufacturer: "ELKO EP" as const,
  model: entity.productType,
  name: entity.name,
  via_device: normalizeTopicSegment(bridgeName),
});

export const buildDiscoveryPayload = ({ baseTopic, bridgeName, entity }: DiscoveryInput) => {
  if (entity.kind === "switch") {
    return {
      name: entity.name,
      unique_id: entity.objectId,
      object_id: entity.objectId,
      command_topic: switchCommandTopic(baseTopic, entity.objectId),
      state_topic: switchStateTopic(baseTopic, entity.objectId),
      availability_topic: availabilityTopic(baseTopic),
      payload_on: "ON" as const,
      payload_off: "OFF" as const,
      state_on: "ON" as const,
      state_off: "OFF" as const,
      device: deviceBlock(bridgeName, entity),
    };
  }

  return {
    name: entity.name,
    unique_id: entity.objectId,
    object_id: entity.objectId,
    command_topic: lightCommandTopic(baseTopic, entity.objectId),
    state_topic: lightStateTopic(baseTopic, entity.objectId),
    availability_topic: availabilityTopic(baseTopic),
    schema: "json" as const,
    brightness: true,
    brightness_scale: 255,
    device: deviceBlock(bridgeName, entity),
  };
};
```

- [ ] **Step 6: Write state conversion tests**

Create `src/mqtt/state.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { buildMqttStatePayload, haBrightnessToRf003, rf003BrightnessToHa } from "./state";

describe("MQTT state conversion", () => {
  test("builds switch state payloads", () => {
    expect(buildMqttStatePayload({ kind: "switch", state: { on: true } })).toBe("ON");
    expect(buildMqttStatePayload({ kind: "switch", state: { on: false } })).toBe("OFF");
  });

  test("builds light state payloads with converted brightness", () => {
    expect(buildMqttStatePayload({ kind: "light", state: { brightness: 50 } })).toBe(
      JSON.stringify({ state: "ON", brightness: 128 }),
    );
  });

  test("builds light off state when RF-003 brightness is null", () => {
    expect(buildMqttStatePayload({ kind: "light", state: { brightness: null } })).toBe(JSON.stringify({ state: "OFF" }));
  });

  test("converts brightness boundaries", () => {
    expect(rf003BrightnessToHa(0)).toBe(0);
    expect(rf003BrightnessToHa(100)).toBe(255);
    expect(haBrightnessToRf003(0)).toBe(0);
    expect(haBrightnessToRf003(255)).toBe(100);
  });
});
```

- [ ] **Step 7: Implement state conversion**

Create `src/mqtt/state.ts`:

```ts
import type { GatewayDeviceState } from "../devices/types";

export const rf003BrightnessToHa = (brightness: number): number => Math.round((brightness / 100) * 255);

export const haBrightnessToRf003 = (brightness: number): number => Math.round((brightness / 255) * 100);

export const buildMqttStatePayload = ({
  kind,
  state,
}: {
  kind: "switch" | "light";
  state: GatewayDeviceState;
}): string => {
  if (kind === "switch") {
    return state.on === true ? "ON" : "OFF";
  }

  if (typeof state.brightness !== "number") {
    return JSON.stringify({ state: "OFF" });
  }

  return JSON.stringify({ state: state.brightness > 0 ? "ON" : "OFF", brightness: rf003BrightnessToHa(state.brightness) });
};
```

- [ ] **Step 8: Run MQTT tests**

Run: `bun test src/mqtt/topics.test.ts src/mqtt/discovery.test.ts src/mqtt/state.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/mqtt src/devices/types.ts
git commit -m "feat: add mqtt light discovery and state conversion"
```

---

### Task 3: Storage Keys And Registry Persistence

**Files:**
- Modify: `src/storage/keys.ts`
- Modify: `src/storage/keys.test.ts`
- Create: `src/storage/registry.ts`
- Create: `src/storage/registry.test.ts`

- [ ] **Step 1: Update storage key test**

Replace the state key assertion in `src/storage/keys.test.ts`:

```ts
expect(stateKey("09354")).toBe("inels:state:09354");
```

- [ ] **Step 2: Update state key helper**

Replace `stateKey` in `src/storage/keys.ts`:

```ts
export const stateKey = (deviceId: string): string => `${PREFIX}:state:${deviceId}`;
```

- [ ] **Step 3: Write registry storage tests**

Create `src/storage/registry.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { DiscoveredEntity } from "../devices/types";
import { loadDeviceRegistry, saveDeviceRegistry } from "./registry";

const entity: DiscoveredEntity = {
  id: "09354",
  kind: "switch",
  name: "Strop - Chodba",
  productType: "RFSA-66M",
  rf003Type: "light",
  objectId: "inels_09354",
};

describe("device registry storage", () => {
  test("saves and loads discovered entities", async () => {
    const values = new Map<string, string>();
    const redis = {
      get: async (key: string) => values.get(key) ?? null,
      set: async (key: string, value: string) => {
        values.set(key, value);
        return "OK";
      },
    };

    await saveDeviceRegistry(redis, [entity]);
    expect(await loadDeviceRegistry(redis)).toEqual([entity]);
  });

  test("returns an empty registry when the key is absent", async () => {
    const redis = { get: async () => null };
    expect(await loadDeviceRegistry(redis)).toEqual([]);
  });
});
```

- [ ] **Step 4: Implement registry storage**

Create `src/storage/registry.ts`:

```ts
import type { DiscoveredEntity } from "../devices/types";
import { deviceRegistryKey } from "./keys";

type RegistryRedis = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<unknown>;
};

export const loadDeviceRegistry = async (redis: Pick<RegistryRedis, "get">): Promise<DiscoveredEntity[]> => {
  const raw = await redis.get(deviceRegistryKey());
  if (raw === null) {
    return [];
  }
  return JSON.parse(raw) as DiscoveredEntity[];
};

export const saveDeviceRegistry = async (
  redis: RegistryRedis,
  entities: DiscoveredEntity[],
): Promise<void> => {
  await redis.set(deviceRegistryKey(), JSON.stringify(entities));
};
```

- [ ] **Step 5: Run storage tests**

Run: `bun test src/storage/keys.test.ts src/storage/registry.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/storage
git commit -m "feat: persist discovered device registry"
```

---

### Task 4: Gateway Operations And Queue Job Types

**Files:**
- Create: `src/gateway/operations.ts`
- Create: `src/gateway/operations.test.ts`
- Modify: `src/queue/jobs.ts`
- Modify: `src/queue/jobs.test.ts`

- [ ] **Step 1: Write gateway operation tests**

Create `src/gateway/operations.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { GatewayClient } from "./types";
import { createGatewayOperations } from "./operations";

describe("gateway operations", () => {
  test("lists device IDs from the RF-003 device map", async () => {
    const client = { call: async () => ({ "09354": { url: "x" }, "00472": { url: "y" } }) } as GatewayClient;
    await expect(createGatewayOperations(client).listDeviceIds()).resolves.toEqual(["09354", "00472"]);
  });

  test("writes switch and brightness commands", async () => {
    const calls: unknown[] = [];
    const client = { call: async (...args: unknown[]) => calls.push(args) } as GatewayClient;
    const ops = createGatewayOperations(client);

    await ops.setSwitch("09354", true);
    await ops.setBrightness("47742", 50);

    expect(calls).toEqual([
      ["devices/09354", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ on: true }) }],
      ["devices/47742", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ brightness: 50 }) }],
    ]);
  });
});
```

- [ ] **Step 2: Implement gateway operations**

Create `src/gateway/operations.ts`:

```ts
import type { GatewayDeviceDetail, GatewayDeviceState } from "../devices/types";
import { gatewayPaths } from "./paths";
import type { GatewayClient } from "./types";

export type GatewayOperations = {
  listDeviceIds: () => Promise<string[]>;
  getDeviceDetail: (id: string) => Promise<GatewayDeviceDetail>;
  getDeviceState: (id: string) => Promise<GatewayDeviceState>;
  setSwitch: (id: string, on: boolean) => Promise<void>;
  setBrightness: (id: string, brightness: number) => Promise<void>;
};

const jsonPut = (body: unknown): RequestInit => ({
  method: "PUT",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const createGatewayOperations = (client: GatewayClient): GatewayOperations => ({
  listDeviceIds: async () => Object.keys((await client.call(gatewayPaths.devices)) as Record<string, unknown>),
  getDeviceDetail: async (id) => (await client.call(gatewayPaths.device(id))) as GatewayDeviceDetail,
  getDeviceState: async (id) => (await client.call(gatewayPaths.deviceState(id))) as GatewayDeviceState,
  setSwitch: async (id, on) => {
    await client.call(gatewayPaths.device(id), jsonPut({ on }));
  },
  setBrightness: async (id, brightness) => {
    await client.call(gatewayPaths.device(id), jsonPut({ brightness }));
  },
});
```

- [ ] **Step 3: Update queue job tests**

In `src/queue/jobs.test.ts`, assert:

```ts
expect(GatewayJobName.SetBrightness).toBe("command.set_brightness");
expect(GatewayJobName.ForceDiscovery).toBe("discovery.force");
```

Also update set-output payload examples to `{ deviceId: "09354", state: "ON" }` with no `channel`.

- [ ] **Step 4: Update queue job types**

Replace `src/queue/jobs.ts` with:

```ts
export const GatewayJobName = {
  SetOutput: "command.set_output",
  SetBrightness: "command.set_brightness",
  PollFullState: "poll.full_state",
  PollDeviceState: "poll.device_state",
  PublishDiscovery: "discovery.publish",
  ForceDiscovery: "discovery.force",
} as const;

export type GatewayJobName = (typeof GatewayJobName)[keyof typeof GatewayJobName];

export const JobPriority = {
  Command: 1,
  Poll: 10,
  Discovery: 20,
} as const;

export type SetOutputJob = {
  name: typeof GatewayJobName.SetOutput;
  data: { deviceId: string; state: "ON" | "OFF" };
};

export type SetBrightnessJob = {
  name: typeof GatewayJobName.SetBrightness;
  data: { deviceId: string; brightness: number };
};

export type PollFullStateJob = { name: typeof GatewayJobName.PollFullState; data: Record<string, never> };
export type PollDeviceStateJob = { name: typeof GatewayJobName.PollDeviceState; data: { deviceId: string } };
export type PublishDiscoveryJob = { name: typeof GatewayJobName.PublishDiscovery; data: Record<string, never> };
export type ForceDiscoveryJob = { name: typeof GatewayJobName.ForceDiscovery; data: Record<string, never> };

export type GatewayJob =
  | SetOutputJob
  | SetBrightnessJob
  | PollFullStateJob
  | PollDeviceStateJob
  | PublishDiscoveryJob
  | ForceDiscoveryJob;
```

- [ ] **Step 5: Run tests**

Run: `bun test src/gateway/operations.test.ts src/queue/jobs.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/gateway/operations.ts src/gateway/operations.test.ts src/queue/jobs.ts src/queue/jobs.test.ts
git commit -m "feat: add gateway operations and phase 6 jobs"
```

---

### Task 5: Worker Job Handlers

**Files:**
- Modify: `src/queue/worker.ts`
- Modify: `src/queue/worker.test.ts`

- [ ] **Step 1: Redesign worker dependencies in tests**

Replace `src/queue/worker.test.ts` with tests that capture the BullMQ processor and call it directly:

```ts
import { describe, expect, mock, test } from "bun:test";
import type { Logger } from "pino";
import type { DiscoveredEntity } from "../devices/types";
import { GatewayJobName } from "./jobs";

let capturedProcessor: ((job: { name: string; data: unknown }) => Promise<void>) | undefined;
let capturedOpts: { concurrency?: number } = {};

mock.module("bullmq", () => ({
  Worker: class MockWorker {
    constructor(_name: string, processor: typeof capturedProcessor, opts: { concurrency?: number } = {}) {
      capturedProcessor = processor;
      capturedOpts = opts;
    }
  },
}));

const { createGatewayWorker } = await import("./worker");

const logger = { child: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }) } as unknown as Logger;
const entity: DiscoveredEntity = { id: "09354", kind: "switch", name: "Hall", productType: "RFSA-66M", rf003Type: "light", objectId: "inels_09354" };

describe("gateway worker", () => {
  test("is created with concurrency 1", () => {
    createGatewayWorker({ host: "localhost", port: 6379 }, logger, makeDeps());
    expect(capturedOpts.concurrency).toBe(1);
  });

  test("handles set output by writing, reading back, storing, and publishing", async () => {
    const calls: string[] = [];
    const deps = makeDeps({
      setSwitch: async () => calls.push("setSwitch"),
      getDeviceState: async () => ({ on: true }),
      saveState: async () => calls.push("saveState"),
      publishState: async () => calls.push("publishState"),
    });
    createGatewayWorker({ host: "localhost", port: 6379 }, logger, deps);

    await capturedProcessor?.({ name: GatewayJobName.SetOutput, data: { deviceId: "09354", state: "ON" } });

    expect(calls).toEqual(["setSwitch", "saveState", "publishState"]);
  });
});

function makeDeps(overrides: Partial<Parameters<typeof createGatewayWorker>[2]> = {}): Parameters<typeof createGatewayWorker>[2] {
  return {
    operations: {
      listDeviceIds: async () => ["09354"],
      getDeviceDetail: async () => ({ "device info": { label: "Hall", "product type": "RFSA-66M", type: "light" }, "actions info": { on: { type: "bool" } }, "primary actions": ["on"] }),
      getDeviceState: async () => ({ on: true }),
      setSwitch: async () => {},
      setBrightness: async () => {},
    },
    loadRegistry: async () => [entity],
    saveRegistry: async () => {},
    saveState: async () => {},
    publishDiscovery: async () => {},
    publishState: async () => {},
    updateLastPoll: async () => {},
    updateLastSuccess: async () => {},
    ...overrides,
  };
}
```

- [ ] **Step 2: Implement worker dependency injection and handlers**

Modify `src/queue/worker.ts` to export `GatewayWorkerDeps` and dispatch jobs:

```ts
import { Worker } from "bullmq";
import type { Logger } from "pino";
import { classifyGatewayDevice } from "../devices/registry";
import type { DiscoveredEntity, GatewayDeviceState } from "../devices/types";
import type { GatewayOperations } from "../gateway/operations";
import type { ValkeyConnectionOptions } from "../storage/valkey";
import { GatewayJobName } from "./jobs";

const QUEUE_NAME = "gateway";
const CONCURRENCY = 1;

export type GatewayWorkerDeps = {
  operations: GatewayOperations;
  loadRegistry: () => Promise<DiscoveredEntity[]>;
  saveRegistry: (entities: DiscoveredEntity[]) => Promise<void>;
  saveState: (deviceId: string, state: GatewayDeviceState) => Promise<void>;
  publishDiscovery: (entities: DiscoveredEntity[]) => Promise<void>;
  publishState: (entity: DiscoveredEntity, state: GatewayDeviceState) => Promise<void>;
  updateLastPoll: () => Promise<void>;
  updateLastSuccess: () => Promise<void>;
};

export const createGatewayWorker = (connection: ValkeyConnectionOptions, logger: Logger, deps: GatewayWorkerDeps): Worker => {
  const workerLogger = logger.child({ module: "queue" });

  return new Worker(
    QUEUE_NAME,
    async (job) => {
      if (job.name === GatewayJobName.ForceDiscovery || job.name === GatewayJobName.PublishDiscovery) {
        const ids = await deps.operations.listDeviceIds();
        const entities: DiscoveredEntity[] = [];
        for (const id of ids) {
          const detail = await deps.operations.getDeviceDetail(id);
          const state = await deps.operations.getDeviceState(id);
          const entity = classifyGatewayDevice({ id, detail, state });
          if (entity) {
            entities.push(entity);
          } else {
            workerLogger.warn({ id, detail }, "unsupported rf-003 device skipped");
          }
        }
        await deps.saveRegistry(entities);
        await deps.publishDiscovery(entities);
        await deps.updateLastSuccess();
        return;
      }

      if (job.name === GatewayJobName.SetOutput) {
        const data = job.data as { deviceId: string; state: "ON" | "OFF" };
        await deps.operations.setSwitch(data.deviceId, data.state === "ON");
        const state = await deps.operations.getDeviceState(data.deviceId);
        const entity = (await deps.loadRegistry()).find((candidate) => candidate.id === data.deviceId);
        if (entity) {
          await deps.saveState(data.deviceId, state);
          await deps.publishState(entity, state);
          await deps.updateLastSuccess();
        }
        return;
      }

      if (job.name === GatewayJobName.SetBrightness) {
        const data = job.data as { deviceId: string; brightness: number };
        await deps.operations.setBrightness(data.deviceId, data.brightness);
        const state = await deps.operations.getDeviceState(data.deviceId);
        const entity = (await deps.loadRegistry()).find((candidate) => candidate.id === data.deviceId);
        if (entity) {
          await deps.saveState(data.deviceId, state);
          await deps.publishState(entity, state);
          await deps.updateLastSuccess();
        }
        return;
      }

      if (job.name === GatewayJobName.PollFullState || job.name === GatewayJobName.PollDeviceState) {
        const registry = await deps.loadRegistry();
        const requestedId = job.name === GatewayJobName.PollDeviceState ? (job.data as { deviceId: string }).deviceId : undefined;
        for (const entity of registry.filter((candidate) => requestedId === undefined || candidate.id === requestedId)) {
          const state = await deps.operations.getDeviceState(entity.id);
          await deps.saveState(entity.id, state);
          await deps.publishState(entity, state);
        }
        await deps.updateLastPoll();
        await deps.updateLastSuccess();
        return;
      }

      throw new Error(`Unsupported gateway job: ${job.name}`);
    },
    { connection, concurrency: CONCURRENCY },
  );
};
```

- [ ] **Step 3: Run worker tests**

Run: `bun test src/queue/worker.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/queue/worker.ts src/queue/worker.test.ts
git commit -m "feat: handle gateway queue jobs"
```

---

### Task 6: MQTT Command Dispatch

**Files:**
- Modify: `src/mqtt/client.ts`
- Create: `src/mqtt/client.test.ts`

- [ ] **Step 1: Add MQTT client dispatch test**

Create `src/mqtt/client.test.ts` with a mocked MQTT client that captures `message` handlers and verifies enqueue calls for switch and light command topics.

```ts
import { describe, expect, mock, test } from "bun:test";
import type { Logger } from "pino";

const handlers = new Map<string, (...args: any[]) => void>();
const subscriptions: string[] = [];

mock.module("mqtt", () => ({
  default: {
    connect: () => ({
      on: (event: string, handler: (...args: any[]) => void) => handlers.set(event, handler),
      subscribe: (topic: string, cb: (err?: Error) => void) => {
        subscriptions.push(topic);
        cb();
      },
      connected: false,
    }),
  },
}));

const { createMqttClient } = await import("./client");

const logger = { child: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }) } as unknown as Logger;

describe("mqtt client command dispatch", () => {
  test("subscribes to switch and light command topics", () => {
    createMqttClient({ url: "mqtt://localhost", baseTopic: "inels", discoveryPrefix: "homeassistant" }, logger, async () => {});
    handlers.get("connect")?.();
    expect(subscriptions).toContain("inels/switch/+/set");
    expect(subscriptions).toContain("inels/light/+/set");
  });

  test("dispatches switch commands", async () => {
    const jobs: unknown[] = [];
    createMqttClient({ url: "mqtt://localhost", baseTopic: "inels", discoveryPrefix: "homeassistant" }, logger, async (job) => jobs.push(job));
    handlers.get("message")?.("inels/switch/inels_09354/set", Buffer.from("ON"));
    expect(jobs).toEqual([{ name: "command.set_output", data: { objectId: "inels_09354", state: "ON" } }]);
  });

  test("dispatches light brightness commands", async () => {
    const jobs: unknown[] = [];
    createMqttClient({ url: "mqtt://localhost", baseTopic: "inels", discoveryPrefix: "homeassistant" }, logger, async (job) => jobs.push(job));
    handlers.get("message")?.("inels/light/inels_47742/set", Buffer.from(JSON.stringify({ brightness: 128 })));
    expect(jobs).toEqual([{ name: "command.set_brightness", data: { objectId: "inels_47742", brightness: 50 } }]);
  });
});
```

- [ ] **Step 2: Implement MQTT command dispatch**

Modify `src/mqtt/client.ts` so `createMqttClient(config, logger, enqueueCommand?)` subscribes to both `switch/+/set` and `light/+/set`. Parse the object ID from the topic and enqueue:

```ts
type EnqueueMqttCommand = (job: { name: string; data: Record<string, unknown> }) => Promise<void>;
```

Switch payloads map `ON`/`OFF` to `command.set_output`. Light JSON payloads with numeric `brightness` map through `haBrightnessToRf003` and enqueue `command.set_brightness`.

Use `objectId` in MQTT-side jobs here. Task 7 resolves `objectId` to RF-003 `deviceId` by loading the registry before adding the BullMQ job.

- [ ] **Step 3: Run MQTT client tests**

Run: `bun test src/mqtt/client.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/mqtt/client.ts src/mqtt/client.test.ts
git commit -m "feat: dispatch mqtt commands to gateway jobs"
```

---

### Task 7: HTTP Endpoints, Readiness, And App Composition

**Files:**
- Modify: `src/observability/readiness.ts`
- Modify: `src/observability/readiness.test.ts`
- Modify: `src/http/server.ts`
- Modify: `src/http/server.test.ts`
- Modify: `src/app/app.ts`

- [ ] **Step 1: Update readiness tests**

Update expected readiness shape to include `rf003`:

```ts
expect(await checkReadiness(mqtt, valkey, async () => true)).toEqual({ ready: true, mqtt: true, valkey: true, rf003: true });
```

- [ ] **Step 2: Update readiness implementation**

Change `ReadinessResult` and `checkReadiness`:

```ts
export type ReadinessResult = {
  ready: boolean;
  mqtt: boolean;
  valkey: boolean;
  rf003: boolean;
};

export const checkReadiness = async (
  mqtt: MqttClient,
  valkey: Redis,
  checkRf003: () => Promise<boolean>,
): Promise<ReadinessResult> => {
  const mqttReady = mqtt.connected;
  let valkeyReady = false;
  let rf003Ready = false;
  try { await valkey.ping(); valkeyReady = true; } catch { valkeyReady = false; }
  try { rf003Ready = await checkRf003(); } catch { rf003Ready = false; }
  return { ready: mqttReady && valkeyReady && rf003Ready, mqtt: mqttReady, valkey: valkeyReady, rf003: rf003Ready };
};
```

- [ ] **Step 3: Update HTTP tests for force discovery and devices**

Add tests to `src/http/server.test.ts`:

```ts
test("POST /discovery/force enqueues force discovery", async () => {
  const calls: string[] = [];
  const app = createHttpServer({ getReadiness: async () => readyResult, forceDiscovery: async () => calls.push("force"), getDevices: async () => [] });
  const response = await app.handle(new Request("http://localhost/discovery/force", { method: "POST" }));
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({ status: "queued" });
  expect(calls).toEqual(["force"]);
});

test("GET /devices returns discovered registry", async () => {
  const app = createHttpServer({ getReadiness: async () => readyResult, forceDiscovery: async () => {}, getDevices: async () => [{ id: "09354" }] });
  const response = await app.handle(new Request("http://localhost/devices"));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual([{ id: "09354" }]);
});
```

- [ ] **Step 4: Update HTTP server deps and routes**

Modify `src/http/server.ts` deps:

```ts
type HttpServerDeps = {
  getReadiness: () => Promise<ReadinessResult>;
  forceDiscovery: () => Promise<void>;
  getDevices: () => Promise<unknown[]>;
};
```

Add routes:

```ts
.get("/devices", async () => getDevices())
.post("/discovery/force", async ({ set }) => {
  await forceDiscovery();
  set.status = 202;
  return { status: "queued" as const };
});
```

- [ ] **Step 5: Compose app dependencies**

Modify `src/app/app.ts` to:

- Create `session`, `client`, and `operations`.
- Create queue before MQTT.
- Pass MQTT command enqueue callback that resolves `objectId` to `deviceId` from `loadDeviceRegistry(valkey)`.
- Create worker with deps that call gateway operations, Valkey registry/state helpers, and MQTT publish helpers.
- Enqueue startup `discovery.force` and repeatable `poll.full_state` jobs.
- Pass `forceDiscovery` and `getDevices` into HTTP server.

Use this object-ID resolver in `app.ts`:

```ts
const resolveEntityId = async (objectId: string): Promise<string | undefined> =>
  (await loadDeviceRegistry(valkey)).find((entity) => entity.objectId === objectId)?.id;
```

- [ ] **Step 6: Run endpoint/readiness tests**

Run: `bun test src/observability/readiness.test.ts src/http/server.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/observability src/http src/app/app.ts
git commit -m "feat: wire readiness and discovery endpoints"
```

---

### Task 8: Verification And Documentation Cleanup

**Files:**
- Modify: `docs/specs/mvp.md`
- Modify: `AGENTS.md` if implementation reveals mismatches

- [ ] **Step 1: Update MVP spec acceptance criteria**

In `docs/specs/mvp.md`, replace acceptance criteria that require 24 switches with wording that requires RF-003-discovered supported entities:

```md
- MQTT Discovery publishes retained configs for all supported RF-003-discovered entities.
```

- [ ] **Step 2: Run full verification**

Run: `bun test`

Expected: all tests pass.

Run: `bun run typecheck`

Expected: exit 0.

Run: `bun run build`

Expected: exit 0 and `dist/index.js` is produced.

- [ ] **Step 3: Inspect git diff**

Run: `git status --short`

Expected: only intended Phase 6 files are changed.

Run: `git diff --stat`

Expected: changes match the tasks above; no `.env`, `node_modules`, or generated secrets are included.

- [ ] **Step 4: Commit documentation cleanup**

```bash
git add docs/specs/mvp.md AGENTS.md
git commit -m "docs: align mvp criteria with rf-003 discovery"
```

Skip this commit if no documentation changes are needed after Step 1.

---

## Plan Self-Review

**Spec coverage:**
- RF-003 discovery: Task 4 operations and Task 5 discovery handlers.
- Detail/state fetch: Task 4 operations and Task 5 discovery handlers.
- Capability classification: Task 1.
- Valkey registry: Task 3 and Task 5 deps.
- MQTT discovery: Task 2 and Task 5 deps.
- MQTT commands through BullMQ: Task 6 and Task 7 app composition.
- State after confirmed reads/writes: Task 5.
- Polling and metadata: Task 5 and Task 7 app composition.
- RF-003 readiness: Task 7.
- Force discovery endpoint: Task 7.

**Placeholder scan:** No placeholder markers, incomplete sections, or unspecified test commands remain.

**Type consistency:** The plan consistently uses `DiscoveredEntity`, RF-003-native `deviceId`, MQTT-facing `objectId`, and `GatewayOperations` across tasks.
