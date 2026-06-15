# Phase 6 End-to-End MVP Flow — Design

**Date:** 2026-06-15
**Phase:** 6 of 7 (MVP spec)
**Goal:** Implement the end-to-end RF-003 to MQTT flow using gateway-discovered entities, including on/off switches and the observed RFDA-71B dimmer.

---

## Scope

Phase 6 wires together the existing gateway, queue, MQTT, storage, HTTP, and readiness primitives into the first useful bridge flow:

- Discover RF-003 devices from `/api/devices`.
- Fetch detail and state for each discovered RF-003 device.
- Classify supported entities by capability shape, not by fixed module count.
- Persist the supported discovered entity registry in Valkey.
- Publish retained Home Assistant MQTT Discovery payloads for supported entities.
- Execute MQTT commands through BullMQ with gateway worker concurrency `1`.
- Publish MQTT state after confirmed RF-003 writes or reads.
- Poll discovered entities and update state metadata.
- Include RF-003 in `/readyz`.
- Add a force-discovery HTTP endpoint.

The bridge must not synthesize missing outputs from known iNELS module capabilities. If RF-003 exposes 19 devices, Home Assistant receives 19 entities. RF-003 remains the source of truth for both inventory and state.

---

## RF-003 Observations

Live probing showed that `/api/devices` returns a flat map of RF-003 logical device IDs to URLs:

```json
{
  "12829": { "url": "http://10.16.20.3/api/devices/12829" },
  "09354": { "url": "http://10.16.20.3/api/devices/09354" }
}
```

Each controllable output appears as its own `/api/devices/:id` object. IDs must remain strings because leading-zero IDs such as `09354`, `03467`, `09062`, and `00472` are valid.

Observed switch-like RFSA-66M detail/state:

```json
{
  "detail": {
    "device info": {
      "label": "Strop - Chodba",
      "product type": "RFSA-66M",
      "type": "light",
      "address": 178877
    },
    "actions info": {
      "on": { "type": "bool" }
    },
    "primary actions": ["on"]
  },
  "state": {
    "on": false,
    "delay": false,
    "automat": false,
    "locked": false
  }
}
```

Observed dimmer-like RFDA-71B detail/state:

```json
{
  "detail": {
    "device info": {
      "label": "Strop - Loznice",
      "product type": "RFDA-71B",
      "type": "dimmed light",
      "address": 121745
    },
    "actions info": {
      "brightness": { "type": "int", "min": 0, "max": 100, "step": 10 }
    },
    "primary actions": ["brightness"]
  },
  "state": {
    "automat": false,
    "brightness": null
  }
}
```

---

## Entity Classification

Add a small capability classification layer in `src/devices/` that converts raw RF-003 detail/state into normalized bridge entities.

Supported Phase 6 entities:

```ts
export type DiscoveredEntity =
  | {
      id: string;
      kind: "switch";
      name: string;
      productType: string;
      rf003Type: string;
      objectId: string;
    }
  | {
      id: string;
      kind: "light";
      capabilities: ["brightness"];
      name: string;
      productType: string;
      rf003Type: string;
      objectId: string;
      brightness: { min: number; max: number; step: number };
    };
```

Classification rules:

- Switch: `primary actions` includes `on`, `actions info.on.type === "bool"`, and the state has boolean `on`.
- Dimmable light: `primary actions` includes `brightness`, `actions info.brightness.type === "int"`, and the state has `brightness` as a number or `null`.
- Unsupported devices are skipped and logged with ID, label, product type, RF-003 type, and primary actions.

Product type is metadata, not the primary classifier. This allows future RF-003 devices with the same capability shape to work without hard-coding every model name.

---

## Storage

Persist the normalized supported registry under `inels:devices`. A forced rediscovery replaces this registry with the latest supported RF-003 entities.

Suggested state keys:

```text
inels:devices
inels:state:<deviceId>
inels:meta:last_poll
inels:meta:last_success
```

The registry is a startup aid and MQTT discovery source. Runtime state still comes from RF-003 reads or confirmed writes. Cached state must not override fresh gateway state.

---

## MQTT Discovery And Topics

Switch entities use the existing switch discovery/state/command conventions.

Light entities add Home Assistant MQTT light discovery:

```text
homeassistant/light/<objectId>/config
<baseTopic>/light/<objectId>/state
<baseTopic>/light/<objectId>/set
```

Use retained discovery messages for both switches and lights.

Dimmer state and commands should use JSON payloads at the MQTT boundary:

```json
{ "state": "ON", "brightness": 128 }
```

RF-003 brightness is native `0..100`; Home Assistant brightness is `0..255`. Convert between these ranges only in the MQTT layer. Gateway and storage code should keep RF-003-native values.

If RF-003 returns `brightness: null`, publish an unknown/unavailable-safe light state rather than inventing a brightness value.

---

## Queue Jobs

All RF-003 communication continues to go through BullMQ with worker concurrency `1`.

Phase 6 job set:

```text
command.set_output
command.set_brightness
poll.full_state
poll.device_state
discovery.publish
discovery.force
```

Priorities:

```text
command.*      priority 1
poll.*         priority 10
discovery.*    priority 20
```

Commands from Home Assistant take precedence over polling and discovery.

---

## Discovery Flow

Startup discovery and `POST /discovery/force` use the same serialized worker flow:

1. Call `/api/devices`.
2. For each discovered ID, call `/api/devices/:id` and `/api/devices/:id/state`.
3. Classify supported entities.
4. Store supported entities in `inels:devices`.
5. Publish retained Home Assistant discovery payloads for supported entities.
6. Log unsupported entities without failing the whole discovery job.

Discovery should be safe to rerun. Removing a device from RF-003 removes it from the stored registry. MQTT discovery cleanup for removed entities can be handled in the implementation if straightforward; otherwise it should be documented as a follow-up.

---

## Command Flow

MQTT command handlers enqueue jobs and never call RF-003 directly.

Switch command flow:

1. MQTT receives `ON` or `OFF` on the switch command topic.
2. Queue `command.set_output` with device ID and desired boolean state.
3. Worker sends `PUT /api/devices/:id` with `{ "on": true | false }`.
4. Worker reads `/api/devices/:id/state`.
5. Worker publishes MQTT state from the confirmed RF-003 state.

Dimmer command flow:

1. MQTT receives Home Assistant light JSON command.
2. Queue `command.set_brightness` with device ID and RF-003-native brightness `0..100`.
3. Worker sends `PUT /api/devices/:id` with `{ "brightness": <0..100> }`.
4. Worker reads `/api/devices/:id/state`.
5. Worker publishes MQTT light state from the confirmed RF-003 state.

Do not report command success until RF-003 confirms through successful write and read-back.

---

## Polling Flow

Polling jobs load `inels:devices`, read `/api/devices/:id/state` for each supported entity, update `inels:state:<deviceId>`, publish MQTT state, and update poll metadata.

Polling intervals remain configurable. Defaults should stay conservative to avoid RF-003 overload.

---

## HTTP And Readiness

Required HTTP behavior:

- `GET /healthz` remains unchanged.
- `GET /readyz` checks MQTT, Valkey, and RF-003 readiness.
- `POST /discovery/force` enqueues forced rediscovery.

Optional if trivial:

- `GET /devices` returns the stored discovered registry.

RF-003 readiness should be lightweight. If it touches RF-003, it must still respect the single serialized gateway path.

---

## Tests

Prioritize pure tests first:

- RF-003 classification: switch, dimmer, unsupported device, leading-zero ID preservation.
- MQTT topic generation for light entities.
- MQTT light discovery payload generation.
- RF-003/Home Assistant brightness conversion.
- Queue job payload types and priorities.
- Worker dispatch for supported job names with fake gateway/MQTT/storage dependencies.
- Readiness result includes RF-003 status.
- HTTP force discovery endpoint enqueues the correct job.

---

## Out Of Scope

- Creating Home Assistant entities for RF-003 devices without supported `on` or `brightness` capability shapes.
- Synthesizing 24 switch entities from physical RFSA-66M module assumptions.
- Direct Home Assistant API integration.
- Multiple RF-003 gateways.
- Web UI for device diagnostics.
- Production Docker hardening, which remains Phase 7.
