# Phase 8 Semantic Entity Classification Design

## Purpose

Phase 8 improves Home Assistant entity modeling by using RF-003 semantic device type and RF channel address instead of relying only on hardware product type or RF-003 runtime device ID.

The bridge should expose each RF-003-discovered output as the Home Assistant entity domain that best matches the controlled load. Hardware product type still determines capabilities, while RF-003 device type determines semantic intent.

## Current Limitation

The MVP classifies supported entities primarily by capability:

- `on` boolean action/state becomes a Home Assistant MQTT `switch`.
- `brightness` integer action/state becomes a Home Assistant MQTT `light`.

This works mechanically, but it loses semantic meaning. For example, a ventilation fan controlled by an RFSA-66M relay is currently exposed like a generic switch even though RF-003 reports its type as `ventilation`.

## RF-003 Source Data

RF-003 device detail includes two important dimensions:

- `device info.product type`: hardware model and capability hint, such as `RFSA-66M` or `RFDA-71B`.
- `device info.type`: controlled load semantics, such as `light`, `lamp`, `dimmed light`, or `ventilation`.

RF-003 device detail also includes:

- `device info.address`: stable RF channel/output identifier.
- top-level or detail `id`: RF-003 API identifier used for gateway calls.

## Identity Model

Use `device info.address` as the stable source identity for Home Assistant discovery and bridge registry identity.

The address is preferred over RF-003 `id` because it identifies the controlled RF channel/output, is unique across exposed outputs, maps back to eLAN configuration, and corresponds to the physical output on a relay or dimmer.

RF-003 `id` remains important for API calls and command routing, but it should not be the primary stable identity used for Home Assistant entity identity.

Recommended normalized fields:

```ts
sourceId: string;
sourceAddress: number;
semanticType: string;
productType: string;
haDomain: "switch" | "light" | "fan";
capability: "on_off" | "brightness";
```

Recommended Home Assistant MQTT Discovery identity:

```text
unique_id = inels_<sourceAddress>
```

`object_id` may continue to be derived from the normalized RF-003 label, but should include the source address as a suffix if needed to avoid collisions.

## Classification Rules

Classification should be two-step:

1. Determine capability from actions/state.
2. Determine Home Assistant domain from RF-003 semantic type plus capability.

Capability rules:

- `actions info.brightness.type === "int"` and compatible state means `brightness` capability.
- `actions info.on.type === "bool"` and compatible state means `on_off` capability.
- Unsupported or malformed capabilities are ignored.

Domain rules:

| RF-003 `device info.type` | Capability | Home Assistant domain |
| --- | --- | --- |
| `dimmed light` | `brightness` | `light` |
| `light` | `brightness` | `light` |
| `light` | `on_off` | `light` |
| `lamp` | `brightness` | `light` |
| `lamp` | `on_off` | `light` |
| `ventilation` | `on_off` | `fan` |
| unknown | `brightness` | `light` fallback |
| unknown | `on_off` | `switch` fallback |

If RF-003 reports a semantic type that implies an unsupported Home Assistant domain, keep the device unsupported until a safe mapping exists.

## MQTT Discovery Changes

Add MQTT Discovery support for the `fan` domain.

For on/off fans, publish a simple MQTT fan config with:

- `state_topic`
- `command_topic`
- `payload_on: "ON"`
- `payload_off: "OFF"`
- bridge availability topic
- device metadata using RF-003 product type and address

On/off lights should be represented as MQTT `light` entities without brightness fields.

Dimmable lights should continue to be represented as MQTT `light` entities with brightness fields.

Generic relays whose RF-003 type is unknown should continue to fall back to MQTT `switch`.

## Domain Change Behavior

Phase 8 can change Home Assistant domains for existing MVP entities:

- RFSA-66M `light` and `lamp` devices may move from `switch.*` to `light.*`.
- RFSA-66M `ventilation` devices may move from `switch.*` to `fan.*`.

Home Assistant domain changes are not simple in-place renames. During development and real-device testing, an output that was previously discovered as `switch.*` may appear as `light.*` or `fan.*` after Phase 8.

The bridge must publish empty retained MQTT Discovery payloads for stale old discovery topics when an entity changes domain or object ID. This allows Home Assistant to remove obsolete MQTT discovery configs.

## Storage And Registry

The Valkey registry should persist both `sourceId` and `sourceAddress`:

- `sourceId` is used for RF-003 API calls.
- `sourceAddress` is used for stable Home Assistant identity.

Stale discovery cleanup should compare previous and current entities by source address and previous discovery topic, not only by object ID.

## Testing Focus

Add tests for:

- `ventilation` with `on` bool maps to MQTT `fan`.
- `light` with `on` bool maps to MQTT `light` without brightness.
- `lamp` with `on` bool maps to MQTT `light` without brightness.
- `dimmed light` with `brightness` int maps to MQTT `light` with brightness.
- Unknown type with `on` bool falls back to MQTT `switch`.
- Unknown type with `brightness` int falls back to MQTT `light`.
- Leading-zero RF-003 `id` remains preserved for API calls.
- MQTT `unique_id` is based on `device info.address`, not RF-003 `id`.
- Stale discovery cleanup removes an old `switch` config when the same source address is now classified as `light` or `fan`.

## Out Of Scope

Phase 8 should not add direct Home Assistant API integration, Home Assistant add-on packaging, custom UI configuration, or manual device mapping. RF-003 discovery remains the source of truth.
