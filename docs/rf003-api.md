# RF-003 API Notes

These notes document sanitized RF-003 HTTP API behavior observed from bridge debug logs. They are intended as implementation reference for this bridge, not as complete vendor documentation.

## Request Flow

- RF-003 requests use paths below the gateway API base, for example `/api/devices`.
- If a gateway request returns `401`, the bridge re-authenticates and retries the original request once through the serialized BullMQ gateway worker.
- Successful JSON responses use `content-type: application/json`.
- Successful write responses observed for `PUT /api/devices/:id` returned HTTP `200` with an empty body.

All RF-003 traffic must remain serialized through the gateway queue with worker concurrency `1`.

## Device List

`GET /api/devices`

Returns an object keyed by RF-003 runtime device ID. IDs may contain leading zeroes and must be treated as strings.

```json
{
  "47742": { "url": "http://<gateway>/api/devices/47742" },
  "09354": { "url": "http://<gateway>/api/devices/09354" }
}
```

The list is inventory source data only. The bridge must fetch each detail endpoint before deciding whether and how to expose the device through MQTT Discovery.

## On/Off Device Detail

`GET /api/devices/:id`

Observed shape for an RFSA-66M output used as a light, switch, or fan depending on RF-003 semantic type:

```json
{
  "id": "09354",
  "device info": {
    "label": "Example Output",
    "product type": "RFSA-66M",
    "type": "light",
    "address": 178877
  },
  "actions info": {
    "on": { "type": "bool" },
    "delayed off": { "type": null },
    "delayed on": { "type": null },
    "delayed off: set time": { "type": "int", "min": 2, "max": 3600, "step": 1 },
    "delayed on: set time": { "type": "int", "min": 2, "max": 3600, "step": 1 },
    "automat": { "type": "bool" }
  },
  "primary actions": ["on"],
  "secondary actions": [
    ["delayed off", "delayed off: set time"],
    ["delayed on", "delayed on: set time"],
    "automat"
  ],
  "settings": {
    "delayed off: set time": 0,
    "delayed on: set time": 0
  }
}
```

The bridge maps a primary boolean `on` action/state to an on/off entity. RF-003 `device info.type` provides the semantic Home Assistant domain, such as `light` or `ventilation`.

## Dimmable Device Detail

`GET /api/devices/:id`

Observed shape for an RFDA-71B dimmer:

```json
{
  "id": "47742",
  "device info": {
    "label": "Example Dimmer",
    "product type": "RFDA-71B",
    "type": "dimmed light",
    "address": 121745
  },
  "actions info": {
    "brightness": { "type": "int", "min": 0, "max": 100, "step": 10 },
    "increase": { "type": null },
    "decrease": { "type": null },
    "increase: set time": { "type": "int", "min": 2, "max": 1800, "step": 1 },
    "decrease: set time": { "type": "int", "min": 2, "max": 1800, "step": 1 },
    "automat": { "type": "bool" }
  },
  "primary actions": ["brightness"],
  "secondary actions": [
    "brightness",
    ["increase", "increase: set time"],
    ["decrease", "decrease: set time"],
    "automat"
  ],
  "settings": {
    "increase: set time": 0,
    "decrease: set time": 0
  }
}
```

The bridge maps a primary integer `brightness` action/state to a Home Assistant MQTT JSON light. The observed RF-003 brightness range is native `0..100`, so MQTT Discovery should advertise `brightness_scale: 100` and MQTT state/command payloads should use values in that same range.

## Device State

`GET /api/devices/:id/state`

Observed on/off state shape:

```json
{
  "on": false,
  "delay": false,
  "automat": false,
  "locked": false,
  "delayed off: set time": 0,
  "delayed on: set time": 0
}
```

Observed dimmer state shape:

```json
{
  "automat": false,
  "brightness": null,
  "increase: set time": 0,
  "decrease: set time": 0
}
```

`brightness: null` means RF-003 did not report a concrete brightness value. The bridge should not publish a light state update for that read.

## Commands

`PUT /api/devices/:id`

Observed on/off command body:

```json
{ "on": true }
```

Observed dimmer command body:

```json
{ "brightness": 50 }
```

After a successful command write, the bridge reads `GET /api/devices/:id/state` and publishes MQTT state from the RF-003 read-back result. It must not report command success from MQTT alone.
