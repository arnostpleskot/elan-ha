# eLAN RF-003 MQTT Bridge

Bridge an existing iNELS RF-003 installation exposed by an RF-003 gateway into Home Assistant through MQTT Discovery.

The app discovers supported RF-003 devices, publishes retained MQTT Discovery payloads, mirrors RF-003 state to MQTT, and sends Home Assistant MQTT commands back to RF-003 through a serialized BullMQ worker.

Devices appear in Home Assistant through the normal MQTT device and entity UI. This app does not provide an ingress UI.
