# MQTT Discovery Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Completed. Verified on 2026-06-17 with `bun test`, `bun run typecheck`, and `bun run build`.

**Goal:** Remove the unresolved Home Assistant parent device reference and keep dimmable light brightness on RF-003's native scale.

**Architecture:** MQTT Discovery remains generated in `src/mqtt/discovery.ts`, MQTT state formatting remains in `src/mqtt/state.ts`, and MQTT command parsing remains in `src/mqtt/client.ts`. The bridge will no longer advertise a `via_device` parent and will use `brightness_scale` to tell Home Assistant the RF-003 brightness maximum.

**Tech Stack:** Bun, TypeScript, MQTT.js, Home Assistant MQTT Discovery, RF-003 HTTP API observations.

---

### Task 1: Update Discovery Tests

**Files:**
- Modify: `src/mqtt/discovery.test.ts`
- Modify: `src/app/app.test.ts`

- [x] **Step 1: Change discovery expectations**

In `src/mqtt/discovery.test.ts`, update the dimmable light expectation from `brightness_scale: 255` to `brightness_scale: 100`, and add assertions that discovery payload device blocks do not have `via_device`.

- [x] **Step 2: Change app discovery expectations**

In `src/app/app.test.ts`, remove each expected `via_device: "inels_bridge"` field from retained discovery payloads, and change the dimmable light `brightness_scale` expectation to `100`.

- [x] **Step 3: Run failing tests**

Run: `bun test src/mqtt/discovery.test.ts src/app/app.test.ts`

Expected before implementation: failures showing unexpected `via_device` and mismatched `brightness_scale`.

### Task 2: Update Brightness Tests

**Files:**
- Modify: `src/mqtt/state.test.ts`
- Modify: `src/mqtt/client.test.ts`

- [x] **Step 1: Change state conversion expectations**

In `src/mqtt/state.test.ts`, expect RF-003 brightness `50` to publish JSON `{ "state": "ON", "brightness": 50 }`. Replace conversion-helper tests with native brightness boundary and clamp tests.

- [x] **Step 2: Change command parsing expectations**

In `src/mqtt/client.test.ts`, send `{"brightness":50}` and expect the enqueued brightness to remain `50`. Add or update invalid brightness expectations so `101` is rejected.

- [x] **Step 3: Run failing tests**

Run: `bun test src/mqtt/state.test.ts src/mqtt/client.test.ts`

Expected before implementation: failures showing old `0..255` conversion behavior.

### Task 3: Implement MQTT Discovery Cleanup

**Files:**
- Modify: `src/mqtt/discovery.ts`

- [x] **Step 1: Remove parent device reference**

Remove `bridgeName` usage from `deviceBlock` and omit `via_device` from the returned device object.

- [x] **Step 2: Use native brightness scale**

Set dimmable light `brightness_scale` to `entity.brightness.max`.

- [x] **Step 3: Run discovery tests**

Run: `bun test src/mqtt/discovery.test.ts src/app/app.test.ts`

Expected after implementation: tests pass.

### Task 4: Implement Native Brightness MQTT Flow

**Files:**
- Modify: `src/mqtt/state.ts`
- Modify: `src/mqtt/client.ts`

- [x] **Step 1: Replace conversion helpers**

In `src/mqtt/state.ts`, replace `rf003BrightnessToHa` and `haBrightnessToRf003` with native brightness helpers that validate finite input and clamp to `0..100`.

- [x] **Step 2: Publish native brightness state**

In `buildMqttStatePayload`, publish the clamped native brightness instead of converting to `0..255`.

- [x] **Step 3: Parse native brightness commands**

In `src/mqtt/client.ts`, reject JSON brightness values outside `0..100` and enqueue valid values unchanged.

- [x] **Step 4: Run brightness tests**

Run: `bun test src/mqtt/state.test.ts src/mqtt/client.test.ts`

Expected after implementation: tests pass.

### Task 5: Document Observed RF-003 API

**Files:**
- Create: `docs/rf003-api.md`

- [x] **Step 1: Add sanitized endpoint notes**

Document observed RF-003 endpoints: `GET /api/devices`, `GET /api/devices/:id`, `GET /api/devices/:id/state`, and `PUT /api/devices/:id`.

- [x] **Step 2: Include sanitized examples**

Include example shapes for RFSA-66M on/off outputs and RFDA-71B dimmable outputs without real hostnames, credentials, cookies, or full location-specific inventory.

### Task 6: Verify Full Change

**Files:**
- No source edits expected.

- [x] **Step 1: Run full tests**

Run: `bun test`

Expected: all tests pass.

- [x] **Step 2: Run typecheck**

Run: `bun run typecheck`

Expected: typecheck passes.

- [x] **Step 3: Run build**

Run: `bun run build`

Expected: build passes.

## Self-Review

- Spec coverage: all spec requirements map to Tasks 1 through 6.
- Placeholder scan: no placeholders or deferred implementation notes remain.
- Type consistency: tasks use existing `DiscoveredEntity`, `entity.brightness.max`, MQTT command, and MQTT state boundaries.
