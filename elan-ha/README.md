# eLAN RF-003 MQTT Bridge

Bridge iNELS RF-003 devices into Home Assistant through MQTT Discovery.

This Home Assistant Supervisor app connects to an RF-003 gateway, reads supported RF-003-discovered devices, and publishes them as MQTT Discovery entities. It uses Home Assistant's MQTT service and runs an internal ephemeral Valkey instance for queueing and runtime cache.

## Requirements

- Home Assistant Supervisor.
- Home Assistant MQTT app installed and configured.
- RF-003 gateway reachable from the app container.

## Configuration

Configure the RF-003 base URL, RF-003 credentials, MQTT topic prefixes, polling intervals, and log level in the app options.

Use the RF-003 IP address if local DNS names such as `rf003.local` do not resolve from inside the app container.

## Behavior

The app has no ingress UI. Discovered RF-003 devices appear in Home Assistant through MQTT Discovery after startup discovery completes.
