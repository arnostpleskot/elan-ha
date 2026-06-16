# Phase 8 Semantic Entity Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classify RF-003 discovered outputs by stable RF address and semantic type so Home Assistant receives `switch`, `light`, or `fan` MQTT Discovery entities that match the controlled load.

**Architecture:** Keep RF-003 discovery as the source of truth. Extend the existing `DiscoveredEntity` model with `sourceId`, `sourceAddress`, and semantic capability fields, then route all topic, discovery, state, command, storage, and stale-cleanup behavior through that model. Keep RF-003 API calls on the existing string `id` so leading-zero gateway IDs remain intact.

**Tech Stack:** Bun, TypeScript, MQTT.js, BullMQ, Valkey, Home Assistant MQTT Discovery.

---

## File Structure

- Modify `src/devices/types.ts`: add `sourceId`, `sourceAddress`, `capability`, on/off light, and fan entity types.
- Modify `src/devices/registry.ts`: derive entity identity from `device info.address`, classify capability first, then Home Assistant domain from `device info.type`.
- Modify `src/devices/registry.test.ts`: cover all Phase 8 classification rules and leading-zero API IDs.
- Modify `src/mqtt/topics.ts`: add fan topic helpers and a domain-based discovery/state/command helper if useful.
- Modify `src/mqtt/topics.test.ts`: cover fan discovery and runtime topics.
- Modify `src/mqtt/discovery.ts`: generate switch, on/off light, dimmable light, and fan discovery payloads using address-based unique IDs.
- Modify `src/mqtt/discovery.test.ts`: cover payload shape for each entity kind/capability.
- Modify `src/mqtt/state.ts`: publish ON/OFF state for switch, fan, and on/off light; keep JSON brightness state for dimmable lights.
- Modify `src/mqtt/state.test.ts`: cover fan and on/off light state payloads.
- Modify `src/mqtt/client.ts`: subscribe to fan commands and parse fan ON/OFF command payloads.
- Modify `src/mqtt/client.test.ts`: cover fan subscriptions and command dispatch.
- Modify `src/storage/registry.ts`: validate the extended registry schema, including fan and on/off light entities.
- Modify `src/storage/registry.test.ts`: cover valid fan/on-off light entities and malformed source addresses.
- Modify `src/queue/worker.ts`: compare stale discovery by `sourceAddress` and previous topic identity, not only object ID.
- Modify `src/queue/worker.test.ts`: cover domain changes at the same address and unchanged source addresses.
- Modify `src/app/app.ts`: resolve discovery/state topics for `fan`, route `fan` commands to `SetOutput`, and pass state builder enough information to distinguish on/off versus brightness lights.
- Modify `src/app/app.test.ts`: update fixtures and expected MQTT discovery/state/command behavior.

## Task 1: Entity Model And Semantic Classification

**Files:**
- Modify: `src/devices/types.ts`
- Modify: `src/devices/registry.ts`
- Test: `src/devices/registry.test.ts`

- [ ] **Step 1: Replace classification tests with Phase 8 expectations**

Use this complete `src/devices/registry.test.ts` content:

```ts
import { describe, expect, test } from "bun:test";
import { classifyGatewayDevice } from "./registry";

describe("RF-003 entity registry", () => {
  test("maps ventilation with on bool to a fan", () => {
    const entity = classifyGatewayDevice({
      id: "09354",
      detail: {
        "device info": { label: "Bathroom Fan", "product type": "RFSA-66M", type: "ventilation", address: 12345 },
        "actions info": { on: { type: "bool" } },
        "primary actions": ["on"],
      },
      state: { on: false },
    });

    expect(entity).toEqual({
      id: "09354",
      sourceId: "09354",
      sourceAddress: 12345,
      kind: "fan",
      capability: "on_off",
      name: "Bathroom Fan",
      productType: "RFSA-66M",
      rf003Type: "ventilation",
      objectId: "inels_12345",
    });
  });

  test("maps light with on bool to an on/off light", () => {
    const entity = classifyGatewayDevice({
      id: "09354",
      detail: {
        "device info": { label: "Hall Light", "product type": "RFSA-66M", type: "light", address: 12346 },
        "actions info": { on: { type: "bool" } },
        "primary actions": ["on"],
      },
      state: { on: true },
    });

    expect(entity).toMatchObject({
      id: "09354",
      sourceId: "09354",
      sourceAddress: 12346,
      kind: "light",
      capability: "on_off",
      objectId: "inels_12346",
    });
    expect(entity).not.toHaveProperty("brightness");
  });

  test("maps lamp with on bool to an on/off light", () => {
    const entity = classifyGatewayDevice({
      id: "09355",
      detail: {
        "device info": { label: "Table Lamp", "product type": "RFSA-66M", type: "lamp", address: 12347 },
        "actions info": { on: { type: "bool" } },
        "primary actions": ["on"],
      },
      state: { on: false },
    });

    expect(entity).toMatchObject({ kind: "light", capability: "on_off", objectId: "inels_12347" });
  });

  test("maps dimmed light with brightness int to a dimmable light", () => {
    const entity = classifyGatewayDevice({
      id: "47742",
      detail: {
        "device info": { label: "Bedroom Ceiling", "product type": "RFDA-71B", type: "dimmed light", address: 47742 },
        "actions info": { brightness: { type: "int", min: 0, max: 100, step: 10 } },
        "primary actions": ["brightness"],
      },
      state: { brightness: null },
    });

    expect(entity).toEqual({
      id: "47742",
      sourceId: "47742",
      sourceAddress: 47742,
      kind: "light",
      capability: "brightness",
      capabilities: ["brightness"],
      name: "Bedroom Ceiling",
      productType: "RFDA-71B",
      rf003Type: "dimmed light",
      objectId: "inels_47742",
      brightness: { min: 0, max: 100, step: 10 },
    });
  });

  test("falls back unknown on bool devices to switch", () => {
    const entity = classifyGatewayDevice({
      id: "22222",
      detail: {
        "device info": { label: "Generic Relay", "product type": "RFSA-66M", type: "unknown", address: 22222 },
        "actions info": { on: { type: "bool" } },
        "primary actions": ["on"],
      },
      state: { on: true },
    });

    expect(entity).toMatchObject({ kind: "switch", capability: "on_off", objectId: "inels_22222" });
  });

  test("falls back unknown brightness devices to light", () => {
    const entity = classifyGatewayDevice({
      id: "33333",
      detail: {
        "device info": { label: "Generic Dimmer", "product type": "RFDA-71B", type: "unknown", address: 33333 },
        "actions info": { brightness: { type: "int" } },
        "primary actions": ["brightness"],
      },
      state: { brightness: 50 },
    });

    expect(entity).toMatchObject({ kind: "light", capability: "brightness", objectId: "inels_33333" });
  });

  test("preserves leading-zero IDs for gateway API calls while using address for HA identity", () => {
    const entity = classifyGatewayDevice({
      id: "00472",
      detail: {
        "device info": { label: "Leading Zero", "product type": "RFSA-66M", type: "light", address: 472 },
        "actions info": { on: { type: "bool" } },
        "primary actions": ["on"],
      },
      state: { on: true },
    });

    expect(entity?.id).toBe("00472");
    expect(entity?.sourceId).toBe("00472");
    expect(entity?.sourceAddress).toBe(472);
    expect(entity?.objectId).toBe("inels_472");
  });

  test("returns undefined when RF-003 address is missing", () => {
    const entity = classifyGatewayDevice({
      id: "12345",
      detail: {
        "device info": { label: "No Address", "product type": "RFSA-66M", type: "light" },
        "actions info": { on: { type: "bool" } },
        "primary actions": ["on"],
      },
      state: { on: true },
    });

    expect(entity).toBeUndefined();
  });

  test("returns undefined for unsupported action shapes", () => {
    const entity = classifyGatewayDevice({
      id: "12345",
      detail: {
        "device info": { label: "Unsupported", "product type": "RF-OTHER", type: "sensor", address: 12345 },
        "actions info": { temperature: { type: "int", min: 0, max: 50, step: 1 } },
        "primary actions": ["temperature"],
      },
      state: { temperature: 22 },
    });

    expect(entity).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `bun test src/devices/registry.test.ts`

Expected: FAIL because `sourceId`, `sourceAddress`, `fan`, and on/off `light` classification are not implemented.

- [ ] **Step 3: Update entity types**

Use this complete `src/devices/types.ts` content:

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

export type EntityCapability = "on_off" | "brightness";

export type BaseEntity = {
  id: string;
  sourceId: string;
  sourceAddress: number;
  name: string;
  productType: string;
  rf003Type: string;
  objectId: string;
};

export type SwitchEntity = BaseEntity & {
  kind: "switch";
  capability: "on_off";
};

export type OnOffLightEntity = BaseEntity & {
  kind: "light";
  capability: "on_off";
};

export type DimmableLightEntity = BaseEntity & {
  kind: "light";
  capability: "brightness";
  capabilities: ["brightness"];
  brightness: { min: number; max: number; step: number };
};

export type FanEntity = BaseEntity & {
  kind: "fan";
  capability: "on_off";
};

export type LightEntity = OnOffLightEntity | DimmableLightEntity;

export type DiscoveredEntity = SwitchEntity | LightEntity | FanEntity;
```

- [ ] **Step 4: Implement semantic classification**

Use this complete `src/devices/registry.ts` content:

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

export const entityObjectId = (sourceAddress: number): string => `inels_${sourceAddress}`;

const normalizedSemanticType = (detail: GatewayDeviceDetail): string => rf003Type(detail).trim().toLowerCase();

const baseEntity = (id: string, detail: GatewayDeviceDetail) => {
  const sourceAddress = detail["device info"]?.address;
  if (typeof sourceAddress !== "number" || !Number.isInteger(sourceAddress) || sourceAddress < 0) {
    return undefined;
  }

  return {
    id,
    sourceId: id,
    sourceAddress,
    name: deviceName(id, detail),
    productType: productType(detail),
    rf003Type: rf003Type(detail),
    objectId: entityObjectId(sourceAddress),
  };
};

const onOffDomain = (semanticType: string): "switch" | "light" | "fan" | undefined => {
  if (semanticType === "light" || semanticType === "lamp") {
    return "light";
  }
  if (semanticType === "ventilation") {
    return "fan";
  }
  if (semanticType === fallback.toLowerCase() || semanticType === "unknown" || semanticType === "") {
    return "switch";
  }
  return "switch";
};

export const classifyGatewayDevice = ({ id, detail, state }: ClassifyGatewayDeviceInput): DiscoveredEntity | undefined => {
  const actions = detail["actions info"] ?? {};
  const base = baseEntity(id, detail);
  if (base === undefined) {
    return undefined;
  }

  const brightness = actions.brightness;
  const stateBrightness = state.brightness;
  if (
    hasPrimaryAction(detail, "brightness") &&
    brightness?.type === "int" &&
    (typeof stateBrightness === "number" || stateBrightness === null)
  ) {
    return {
      ...base,
      kind: "light",
      capability: "brightness",
      capabilities: ["brightness"],
      brightness: {
        min: brightness.min ?? 0,
        max: brightness.max ?? 100,
        step: brightness.step ?? 1,
      },
    };
  }

  if (hasPrimaryAction(detail, "on") && actions.on?.type === "bool" && typeof state.on === "boolean") {
    const domain = onOffDomain(normalizedSemanticType(detail));
    if (domain === undefined) {
      return undefined;
    }

    return { ...base, kind: domain, capability: "on_off" };
  }

  return undefined;
};
```

- [ ] **Step 5: Run the focused test to verify it passes**

Run: `bun test src/devices/registry.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

Run: `git add src/devices/types.ts src/devices/registry.ts src/devices/registry.test.ts && git commit -m "feat: classify entities by semantic type"`

Expected: commit succeeds.

## Task 2: MQTT Topics, Discovery Payloads, And State Payloads

**Files:**
- Modify: `src/mqtt/topics.ts`
- Modify: `src/mqtt/topics.test.ts`
- Modify: `src/mqtt/discovery.ts`
- Modify: `src/mqtt/discovery.test.ts`
- Modify: `src/mqtt/state.ts`
- Modify: `src/mqtt/state.test.ts`

- [ ] **Step 1: Add failing topic tests for fan topics**

Append these expectations to the existing `builds light discovery and runtime topics` test in `src/mqtt/topics.test.ts`, and import `fanCommandTopic`, `fanDiscoveryTopic`, and `fanStateTopic` from `./topics`:

```ts
expect(fanDiscoveryTopic("homeassistant", "inels_12345")).toBe("homeassistant/fan/inels_12345/config");
expect(fanStateTopic("inels", "inels_12345")).toBe("inels/fan/inels_12345/state");
expect(fanCommandTopic("inels", "inels_12345")).toBe("inels/fan/inels_12345/set");
```

- [ ] **Step 2: Run topic tests to verify they fail**

Run: `bun test src/mqtt/topics.test.ts`

Expected: FAIL because fan topic helpers are not exported.

- [ ] **Step 3: Add fan topic helpers**

Add these exports to `src/mqtt/topics.ts` after the light helpers:

```ts
export const fanDiscoveryTopic = (discoveryPrefix: string, objectId: string): string =>
  joinTopic(discoveryPrefix, "fan", normalizeTopicSegment(objectId), "config");

export const fanStateTopic = (baseTopic: string, objectId: string): string =>
  joinTopic(baseTopic, "fan", normalizeTopicSegment(objectId), "state");

export const fanCommandTopic = (baseTopic: string, objectId: string): string =>
  joinTopic(baseTopic, "fan", normalizeTopicSegment(objectId), "set");
```

- [ ] **Step 4: Run topic tests to verify they pass**

Run: `bun test src/mqtt/topics.test.ts`

Expected: PASS.

- [ ] **Step 5: Replace discovery tests with switch, fan, on/off light, and dimmable light coverage**

Update `src/mqtt/discovery.test.ts` fixtures so every entity includes `sourceId`, `sourceAddress`, and `capability`. Add these tests:

```ts
test("builds Home Assistant fan discovery payload", () => {
  const entity: DiscoveredEntity = {
    id: "09354",
    sourceId: "09354",
    sourceAddress: 12345,
    kind: "fan",
    capability: "on_off",
    name: "Bathroom Fan",
    productType: "RFSA-66M",
    rf003Type: "ventilation",
    objectId: "inels_12345",
  };

  expect(buildDiscoveryPayload({ baseTopic: "inels", bridgeName: "iNELS Bridge", entity })).toMatchObject({
    name: "Bathroom Fan",
    unique_id: "inels_12345",
    object_id: "inels_12345",
    command_topic: "inels/fan/inels_12345/set",
    state_topic: "inels/fan/inels_12345/state",
    payload_on: "ON",
    payload_off: "OFF",
    state_on: "ON",
    state_off: "OFF",
    device: { identifiers: ["inels_12345"], model: "RFSA-66M", name: "Bathroom Fan" },
  });
});

test("builds Home Assistant on/off light discovery payload without brightness fields", () => {
  const entity: DiscoveredEntity = {
    id: "09355",
    sourceId: "09355",
    sourceAddress: 12346,
    kind: "light",
    capability: "on_off",
    name: "Hall Light",
    productType: "RFSA-66M",
    rf003Type: "light",
    objectId: "inels_12346",
  };

  const payload = buildDiscoveryPayload({ baseTopic: "inels", bridgeName: "iNELS Bridge", entity });
  expect(payload).toMatchObject({
    command_topic: "inels/light/inels_12346/set",
    state_topic: "inels/light/inels_12346/state",
    payload_on: "ON",
    payload_off: "OFF",
    state_on: "ON",
    state_off: "OFF",
  });
  expect(payload).not.toHaveProperty("brightness");
  expect(payload).not.toHaveProperty("brightness_scale");
});
```

- [ ] **Step 6: Run discovery tests to verify they fail**

Run: `bun test src/mqtt/discovery.test.ts`

Expected: FAIL because fan discovery and on/off light discovery are not implemented.

- [ ] **Step 7: Implement fan and on/off light discovery**

In `src/mqtt/discovery.ts`, import fan topic helpers and update `deviceBlock` to use `entity.sourceAddress`:

```ts
const deviceBlock = (bridgeName: string, entity: DiscoveredEntity) => ({
  identifiers: [`inels_${entity.sourceAddress}`],
  manufacturer: "ELKO EP" as const,
  model: entity.productType,
  name: entity.name,
  via_device: normalizeTopicSegment(bridgeName),
});
```

Use a shared on/off payload branch for `switch`, `fan`, and `light` entities with `capability === "on_off"`. Use existing JSON brightness payload only when `entity.kind === "light" && entity.capability === "brightness"`.

- [ ] **Step 8: Add failing state tests for fan and on/off light**

Add these tests to `src/mqtt/state.test.ts`:

```ts
test("builds fan state payloads", () => {
  expect(buildMqttStatePayload({ kind: "fan", capability: "on_off", state: { on: true } })).toBe("ON");
  expect(buildMqttStatePayload({ kind: "fan", capability: "on_off", state: { on: false } })).toBe("OFF");
});

test("builds on/off light state payloads", () => {
  expect(buildMqttStatePayload({ kind: "light", capability: "on_off", state: { on: true } })).toBe("ON");
  expect(buildMqttStatePayload({ kind: "light", capability: "on_off", state: { on: false } })).toBe("OFF");
});
```

Update existing light brightness tests to call `buildMqttStatePayload({ kind: "light", capability: "brightness", state: ... })`.

- [ ] **Step 9: Run state tests to verify they fail**

Run: `bun test src/mqtt/state.test.ts`

Expected: FAIL because the state builder does not accept `fan` or `capability`.

- [ ] **Step 10: Implement capability-aware state payloads**

Update `buildMqttStatePayload` in `src/mqtt/state.ts` to this signature and branch:

```ts
export const buildMqttStatePayload = ({
  kind,
  capability,
  state,
}: {
  kind: "switch" | "light" | "fan";
  capability: "on_off" | "brightness";
  state: GatewayDeviceState;
}): string | undefined => {
  if (capability === "on_off") {
    if (typeof state.on !== "boolean") {
      throw new Error(`Missing boolean ${kind} state: on`);
    }

    return state.on === true ? "ON" : "OFF";
  }

  if (!("brightness" in state)) {
    throw new Error("Missing light state: brightness");
  }

  if (state.brightness === null) {
    return undefined;
  }

  if (typeof state.brightness !== "number") {
    throw new Error("Missing light state: brightness");
  }

  if (!Number.isFinite(state.brightness)) {
    throw new Error("Invalid light state: brightness");
  }

  return JSON.stringify({ state: state.brightness > 0 ? "ON" : "OFF", brightness: rf003BrightnessToHa(state.brightness) });
};
```

- [ ] **Step 11: Run MQTT unit tests**

Run: `bun test src/mqtt/topics.test.ts src/mqtt/discovery.test.ts src/mqtt/state.test.ts`

Expected: PASS.

- [ ] **Step 12: Commit**

Run: `git add src/mqtt/topics.ts src/mqtt/topics.test.ts src/mqtt/discovery.ts src/mqtt/discovery.test.ts src/mqtt/state.ts src/mqtt/state.test.ts && git commit -m "feat: publish semantic mqtt discovery"`

Expected: commit succeeds.

## Task 3: MQTT Fan Commands And App Routing

**Files:**
- Modify: `src/mqtt/client.ts`
- Modify: `src/mqtt/client.test.ts`
- Modify: `src/app/app.ts`
- Modify: `src/app/app.test.ts`

- [ ] **Step 1: Add failing fan command client tests**

In `src/mqtt/client.test.ts`, update the subscription expectation to include `"inels/fan/+/set"`, and add:

```ts
test("dispatches fan command from command topic", () => {
  const commands: unknown[] = [];
  createMqttClient(config, logger, async (command) => {
    commands.push(command);
  });

  handlers.get("message")?.("inels/fan/inels_12345/set", Buffer.from("OFF"));

  expect(commands).toEqual([{ kind: "fan", objectId: "inels_12345", state: "OFF" }]);
});
```

- [ ] **Step 2: Run client tests to verify they fail**

Run: `bun test src/mqtt/client.test.ts`

Expected: FAIL because fan command topics are not subscribed or parsed.

- [ ] **Step 3: Implement fan command parsing**

In `src/mqtt/client.ts`, update `MqttCommand` and parsed topic kind:

```ts
export type MqttCommand =
  | { kind: "switch"; objectId: string; state: "ON" | "OFF" }
  | { kind: "fan"; objectId: string; state: "ON" | "OFF" }
  | { kind: "light"; objectId: string; brightness: number };
```

Import `fanCommandTopic`, include it in `commandTopics`, allow `kind !== "switch" && kind !== "light" && kind !== "fan"`, and treat `switch` and `fan` command payloads as ON/OFF strings before the light JSON branch.

- [ ] **Step 4: Update app routing tests for fan and on/off lights**

In `src/app/app.test.ts`, update fixtures with `sourceId`, `sourceAddress`, and `capability`. Add a `fanEntity` fixture:

```ts
const fanEntity: DiscoveredEntity = {
  id: "09356",
  sourceId: "09356",
  sourceAddress: 12345,
  kind: "fan",
  capability: "on_off",
  name: "Bathroom Fan",
  productType: "RFSA-66M",
  rf003Type: "ventilation",
  objectId: "inels_12345",
};
```

Add this command routing test:

```ts
test("resolves fan object ID and enqueues set output job", async () => {
  const added: unknown[][] = [];
  const enqueue = createMqttCommandEnqueuer({
    valkey: { get: async () => JSON.stringify([fanEntity]) },
    queue: { add: async (...args: unknown[]) => added.push(args) },
    logger,
  });

  await enqueue({ kind: "fan", objectId: "inels_12345", state: "OFF" });

  expect(added).toEqual([
    [GatewayJobName.SetOutput, { deviceId: "09356", state: "OFF" }, commandJobOptions],
  ]);
});
```

- [ ] **Step 5: Run app tests to verify they fail**

Run: `bun test src/app/app.test.ts`

Expected: FAIL because app topic routing and command routing do not handle `fan`, and `buildMqttStatePayload` calls need `capability`.

- [ ] **Step 6: Implement app topic and command routing**

In `src/app/app.ts`, import `fanDiscoveryTopic` and `fanStateTopic`. Update `discoveryTopic` and `stateTopic` to switch on `entity.kind` with fan branches. Update `createMqttCommandEnqueuer` so `command.kind === "switch" || command.kind === "fan"` enqueues `GatewayJobName.SetOutput`. Update publish state to call:

```ts
const payload = buildMqttStatePayload({ kind: entity.kind, capability: entity.capability, state });
```

- [ ] **Step 7: Run client and app tests**

Run: `bun test src/mqtt/client.test.ts src/app/app.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

Run: `git add src/mqtt/client.ts src/mqtt/client.test.ts src/app/app.ts src/app/app.test.ts && git commit -m "feat: route fan mqtt commands"`

Expected: commit succeeds.

## Task 4: Storage Schema And Stale Discovery Cleanup

**Files:**
- Modify: `src/storage/registry.ts`
- Modify: `src/storage/registry.test.ts`
- Modify: `src/queue/worker.ts`
- Modify: `src/queue/worker.test.ts`

- [ ] **Step 1: Add failing storage validation tests**

Update `src/storage/registry.test.ts` entity fixtures with `sourceId`, `sourceAddress`, and `capability`. Add:

```ts
test("loads fan and on/off light entities", async () => {
  const fan: DiscoveredEntity = {
    id: "09356",
    sourceId: "09356",
    sourceAddress: 12345,
    kind: "fan",
    capability: "on_off",
    name: "Bathroom Fan",
    productType: "RFSA-66M",
    rf003Type: "ventilation",
    objectId: "inels_12345",
  };
  const light: DiscoveredEntity = {
    id: "09357",
    sourceId: "09357",
    sourceAddress: 12346,
    kind: "light",
    capability: "on_off",
    name: "Hall Light",
    productType: "RFSA-66M",
    rf003Type: "light",
    objectId: "inels_12346",
  };
  const redis = { get: async () => JSON.stringify([fan, light]) };
  const { logger } = makeLogger();

  expect(await loadDeviceRegistry(redis, logger)).toEqual([fan, light]);
});

test("returns an empty registry and logs warn when source address is malformed", async () => {
  const redis = { get: async () => JSON.stringify([{ ...entity, sourceAddress: "09354" }]) };
  const { logger, warnings } = makeLogger();

  expect(await loadDeviceRegistry(redis, logger)).toEqual([]);
  expect(warnings).toHaveLength(1);
});
```

- [ ] **Step 2: Run storage tests to verify they fail**

Run: `bun test src/storage/registry.test.ts`

Expected: FAIL because the registry validator does not require the new schema or allow fan entities.

- [ ] **Step 3: Implement extended registry validation**

In `src/storage/registry.ts`, update `hasStringEntityFields` to require `sourceId`, keep `id`, and add a finite integer `sourceAddress` check. Update `isDiscoveredEntity` so:

```ts
if ((value.kind === "switch" || value.kind === "fan") && value.capability === "on_off") {
  return true;
}

if (value.kind === "light" && value.capability === "on_off") {
  return true;
}

return value.kind === "light" &&
  value.capability === "brightness" &&
  isBrightnessCapability(value.capabilities) &&
  isValidBrightness(value.brightness);
```

- [ ] **Step 4: Add failing stale cleanup tests by source address**

In `src/queue/worker.test.ts`, update all fixtures with the new fields. Add this test:

```ts
test("discovery clears previous discovery when the same source address changes domain", async () => {
  const previousSwitch: DiscoveredEntity = {
    ...switchEntity,
    kind: "switch",
    capability: "on_off",
    sourceAddress: 12345,
    objectId: "inels_12345",
  };
  const currentFanDetail: GatewayDeviceDetail = {
    "device info": { label: "Hall", "product type": "RFSA-66M", type: "ventilation", address: 12345 },
    "actions info": { on: { type: "bool" } },
    "primary actions": ["on"],
  };
  const cleared: DiscoveredEntity[] = [];
  const deps = makeDeps({
    loadRegistry: async () => [previousSwitch],
    operations: {
      ...makeDeps().operations,
      getDeviceDetail: async () => currentFanDetail,
      getDeviceState: async () => ({ on: true }),
    },
    clearDiscovery: async (entity: DiscoveredEntity) => {
      cleared.push(entity);
    },
  });

  createGatewayWorker({ host: "localhost", port: 6379 }, logger, deps);
  await capturedProcessor?.({ name: GatewayJobName.ForceDiscovery, data: {} });

  expect(cleared).toEqual([previousSwitch]);
});
```

- [ ] **Step 5: Run worker tests to verify they fail**

Run: `bun test src/queue/worker.test.ts`

Expected: FAIL until fixtures and cleanup logic are updated.

- [ ] **Step 6: Implement source-address stale cleanup**

In `src/queue/worker.ts`, replace `findStaleDiscoveryEntities` with source-address matching:

```ts
const findStaleDiscoveryEntities = (
  previousEntities: DiscoveredEntity[],
  currentEntities: DiscoveredEntity[],
): DiscoveredEntity[] => {
  const currentBySourceAddress = new Map(currentEntities.map((entity) => [entity.sourceAddress, entity]));

  return previousEntities.filter((previousEntity) => {
    const currentEntity = currentBySourceAddress.get(previousEntity.sourceAddress);
    return (
      currentEntity === undefined ||
      currentEntity.kind !== previousEntity.kind ||
      currentEntity.objectId !== previousEntity.objectId
    );
  });
};
```

- [ ] **Step 7: Run storage and worker tests**

Run: `bun test src/storage/registry.test.ts src/queue/worker.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

Run: `git add src/storage/registry.ts src/storage/registry.test.ts src/queue/worker.ts src/queue/worker.test.ts && git commit -m "fix: clear stale discovery by source address"`

Expected: commit succeeds.

## Task 5: Full Verification And Typecheck

**Files:**
- Modify only if verification exposes a concrete issue.

- [ ] **Step 1: Run full unit test suite**

Run: `bun test`

Expected: PASS.

- [ ] **Step 2: Run TypeScript typecheck**

Run: `bun run typecheck`

Expected: PASS.

- [ ] **Step 3: Run build**

Run: `bun run build`

Expected: PASS and `dist/index.js` is produced or updated.

- [ ] **Step 4: Inspect git diff**

Run: `git diff --stat && git diff -- src/devices src/mqtt src/storage src/queue src/app`

Expected: diff only contains Phase 8 semantic classification changes.

- [ ] **Step 5: Commit verification fixes if any were needed**

If Step 1, 2, or 3 required code fixes, run: `git add <fixed-files> && git commit -m "fix: complete phase 8 verification"`

Expected: commit succeeds. If no fixes were needed, do not create an empty commit.

## Follow-Up Operational Notes

These notes are outside the Phase 8 semantic-entity implementation, but should be captured for the next observability/storage hardening plan.

1. RF-003 401 retry logging should not spam warning-level logs. RF-003 returns 401 as part of the expected session renewal flow, roughly every 30 minutes. Lower the log level for the first retryable 401 from Pino level 40 (`warn`) to level 30 (`info`), while keeping persistent authentication failure after retry at `warn` or `error`.

2. Keep production JSON log timestamps machine-friendly by default unless deployment logs are consumed directly by humans. In development, `pino-pretty` already renders readable timestamps. For production, prefer leaving Pino's default numeric `time` field for log shippers and relying on Docker/Loki/Grafana timestamps; optionally add a `LOG_TIME_FORMAT=epoch|iso` style setting later if raw container logs need ISO timestamps.

3. Debug logging should include request/response traces for both external sides of the bridge: RF-003 HTTP and MQTT. Logs must redact sensitive fields before output. Use Pino redaction for fields such as RF-003 username/password, session cookies, MQTT username/password, authorization headers, and any command payload fields that could contain credentials in the future.

4. Valkey persistence should be optional for deployments on flash or memory-card storage. Current Valkey logs show periodic background saves, for example `100 changes in 300 seconds. Saving...`, which means write amplification can reduce storage lifetime. The registry/cache mainly saves startup time; RF-003 remains authoritative and discovery can rebuild state after restart. Add a deployment/config option to run Valkey without disk persistence for cache-heavy installs, while keeping persistence available for users who want BullMQ/registry metadata to survive full stack restarts.

5. Discovery/cache writes should avoid unnecessary churn. Before saving `inels:devices` and state keys, compare the new serialized value with the existing value or otherwise skip writes when the content is unchanged. This reduces Valkey dirty pages and background saves, especially if forced or scheduled discovery republishes the same registry repeatedly.

## Self-Review

- Spec coverage: The plan covers semantic classification, address-based identity, fan discovery, on/off light discovery, dimmable light discovery, leading-zero API IDs, stale discovery cleanup, storage registry fields, MQTT commands, and verification.
- Placeholder scan: No placeholders remain; each task has concrete file paths, command names, and expected outcomes.
- Type consistency: Entity fields are consistently `id`, `sourceId`, `sourceAddress`, `kind`, `capability`, `objectId`, with brightness-only fields present only on dimmable lights.
