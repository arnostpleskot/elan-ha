# eLAN RF-003 MQTT Bridge

![eLAN RF-003 MQTT Bridge](logo.png)

Bridge iNELS RF-003 devices into Home Assistant through MQTT Discovery.

This Home Assistant Supervisor app connects to an RF-003 gateway, reads supported RF-003-discovered devices, and publishes them as MQTT Discovery entities. It uses Home Assistant's MQTT service and runs an internal ephemeral Valkey instance for queueing and runtime cache.

## Current Status

This app is published as a third-party Home Assistant app repository for early real-world testing. Official repository submission is intentionally deferred until more users validate install, update, discovery, command, and polling behavior in real deployments.

## Requirements

- Home Assistant Supervisor.
- Home Assistant MQTT app installed and configured.
- RF-003 gateway reachable from the app container.

## Supported Entities

- RF-003-discovered devices with boolean `on` state/action are exposed as switch entities.
- RF-003-discovered devices with integer `brightness` state/action are exposed as dimmable light entities.
- Unsupported RF-003 devices are ignored instead of being synthesized from physical module capabilities.

## Configuration

Configure the RF-003 base URL, RF-003 credentials, MQTT topic prefixes, polling intervals, and log level in the app options.

Use the RF-003 IP address if local DNS names such as `rf003.local` do not resolve from inside the app container.

## Behavior

The app has no ingress UI. Discovered RF-003 devices appear in Home Assistant through MQTT Discovery after startup discovery completes.

RF-003 remains the source of truth for inventory and state. Commands are sent back to RF-003 and state is published only after confirmed gateway reads or writes.

## Feedback

Please report real-world install, update, discovery, command, polling, and device compatibility feedback through the GitHub issue templates. Sanitize logs before posting them and do not include RF-003 passwords, MQTT credentials, tokens, or other secrets.

## Disclaimer

This project is independently maintained and is not affiliated with, endorsed by, sponsored by, or associated with ELKO EP, s.r.o. eLAN, iNELS, and RF-003 are trademarks or product names of their respective owners.
