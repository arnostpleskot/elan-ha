# MQTT Discovery Cleanup Design

## Context

Real Home Assistant testing showed two MQTT Discovery problems:

- Every discovered entity includes `device.via_device: "inels_bridge"`, but the bridge does not publish a corresponding Home Assistant device. Home Assistant can show that unresolved parent as an unknown device.
- RF-003 reports the RFDA-71B dimmer brightness action as `min: 0`, `max: 100`, `step: 10`, but discovery advertises `brightness_scale: 255` and the MQTT layer converts values between RF-003 `0..100` and Home Assistant `0..255`.

Home Assistant MQTT JSON light discovery supports `brightness_scale`, where the value defines the device-native maximum brightness. This lets the bridge keep RF-003-native brightness values in MQTT payloads.

## Design

Remove `via_device` from per-entity MQTT Discovery device blocks until the bridge deliberately publishes a real bridge/hub device or diagnostic entity. Each RF-003 output remains its own Home Assistant device using the stable `entity.objectId` identifier.

For dimmable lights, publish `brightness_scale` from the RF-003 brightness capability maximum. The current supported RFDA-71B range is `0..100`, so MQTT state payloads and MQTT commands should use the same `0..100` values that RF-003 uses. Gateway, queue, storage, and registry code already validate brightness as RF-003-native `0..100`; the MQTT layer should stop converting values to `0..255`.

## Components

- `src/mqtt/discovery.ts`: remove `via_device`; set dimmable `brightness_scale` from `entity.brightness.max`.
- `src/mqtt/state.ts`: replace RF-003/Home Assistant conversion helpers with native brightness validation and clamping.
- `src/mqtt/client.ts`: accept JSON light brightness values in `0..100` and enqueue them unchanged, with `OFF` still mapping to brightness `0` and state-only `ON` still mapping to `100`.
- Tests: update discovery, state, client, and app expectations for the native scale and absent `via_device`.
- `docs/rf003-api.md`: document observed sanitized RF-003 endpoints and payload shapes from debug logs.

## Testing

Use unit tests to lock down behavior:

- Discovery payloads must not include `via_device`.
- Dimmable light discovery must advertise `brightness_scale: 100` for the observed RFDA-71B capability.
- Dimmable light MQTT state for RF-003 brightness `50` must publish JSON brightness `50`.
- Dimmable light command JSON brightness `50` must enqueue brightness `50`.
- Brightness values above `100` must be rejected by MQTT command parsing.

Run `bun test`, `bun run typecheck`, and `bun run build` after implementation.
