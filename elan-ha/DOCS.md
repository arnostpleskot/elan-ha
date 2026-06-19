# eLAN RF-003 MQTT Bridge Documentation

## Current Status

This app is currently distributed as a third-party Home Assistant app repository for early real-world testing. Official repository submission is deferred until users validate installation, updates, RF-003 discovery, command handling, polling behavior, and architecture compatibility across real deployments.

## Requirements

- Home Assistant Supervisor.
- The Home Assistant MQTT app is required and must be configured before this app starts.
- RF-003 gateway reachable from the Home Assistant app container.
- RF-003 credentials with access to the gateway HTTP/XML API.

## Configuration

| Option                          | Description                                                                                                                                                                        |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rf003_base_url`                | RF-003 gateway URL, for example `http://192.168.1.50`. This must be a valid `http://` or `https://` URL. Prefer an IP address when local DNS names do not resolve from containers. |
| `rf003_username`                | RF-003 username.                                                                                                                                                                   |
| `rf003_password`                | RF-003 password.                                                                                                                                                                   |
| `mqtt_discovery_prefix`         | MQTT Discovery prefix. Keep `homeassistant` unless your Home Assistant MQTT integration uses a different prefix.                                                                   |
| `mqtt_base_topic`               | Bridge MQTT state and command base topic. Default: `inels`.                                                                                                                        |
| `poll_full_state_interval_ms`   | Full state poll interval in milliseconds. Default: `60000`.                                                                                                                        |
| `poll_device_state_interval_ms` | Per-device state poll interval in milliseconds. Default: `300000`.                                                                                                                 |
| `log_level`                     | Bridge log level: `trace`, `debug`, `info`, `warn`, `error`, or `fatal`. Use `debug` or `trace` only while troubleshooting.                                                        |

The app reads MQTT host, port, username, and password from the Supervisor MQTT service. Manual MQTT broker configuration is available through the standalone Docker Compose deployment, not this Home Assistant app package.

## Installation

1. In Home Assistant Supervisor, open the app store repository settings.
2. Add `https://github.com/arnostpleskot/elan-ha` as an app repository.
3. Install the `eLAN RF-003 MQTT Bridge` app.
4. Configure the RF-003 options.
5. Start the app.

The app `config.yaml` references the GHCR image name. Install and update availability depends on that image being published for the app version.

## Supported Device Behavior

RF-003 is the source of truth for device inventory and state. The bridge exposes only devices returned by RF-003 discovery and classified as supported entities.

Supported MVP entities:

- RF-003 devices with a boolean `on` state/action are exposed as Home Assistant switch entities.
- RF-003 devices with an integer `brightness` state/action are exposed as Home Assistant dimmable light entities.

The bridge does not synthesize outputs from physical iNELS module capabilities. If RF-003 discovery does not expose a device or output, the bridge does not create a Home Assistant entity for it.

## RF-003 Network Access

Use the RF-003 IP address if local DNS or mDNS names do not resolve from inside the app container. For example, prefer `http://192.168.1.50` over `http://rf003.local` when troubleshooting startup connectivity.

Confirm that the RF-003 gateway is reachable from the Home Assistant host network and that the configured base URL includes the scheme, such as `http://` or `https://`.

## MQTT Discovery

The app publishes Home Assistant MQTT Discovery messages after startup discovery. Entities should appear in Home Assistant's normal device and entity UI after MQTT discovery messages are retained by the broker.

If entities do not appear:

- Confirm the Home Assistant MQTT app is installed and running.
- Confirm the Home Assistant MQTT integration uses the same discovery prefix configured in `mqtt_discovery_prefix`.
- Restart the bridge app and check logs for RF-003 login, discovery, and MQTT publish messages.
- Confirm the RF-003 device is present in RF-003 discovery and maps to a supported switch or dimmable light entity.

## Commands And Polling

Commands from Home Assistant are sent to RF-003 through a serialized BullMQ queue. The bridge publishes state after RF-003 confirms a write or after state is read back from the gateway.

Polling intervals are configurable. Shorter intervals make Home Assistant reflect RF-003 changes faster, but increase gateway traffic.

## Restart And Update Behavior

The app runs an internal ephemeral Valkey instance for BullMQ and runtime cache. Valkey is not persisted. After restart or update, the bridge reads RF-003 again, rebuilds its supported device registry, and republishes MQTT Discovery. Home Assistant entity remapping should not be required as long as RF-003 device identities remain stable.

## Logs And Diagnostics

Diagnostics are written to stdout/stderr and are visible in Supervisor logs. Use `debug` or `trace` log level only while troubleshooting because these levels may include sanitized RF-003 and MQTT boundary details.

When reporting problems, include:

- App version.
- Home Assistant version.
- Supervisor architecture, such as `amd64` or `aarch64`.
- RF-003 firmware/version if known.
- Whether RF-003 is configured by IP address or local DNS name.
- Sanitized logs from startup through the failure.
- Device model and behavior details for compatibility reports.

Do not include RF-003 passwords, MQTT credentials, tokens, or other secrets.

## Known Limitations

- No ingress UI is provided.
- Home Assistant integration is through MQTT Discovery only.
- Unsupported RF-003-discovered devices are ignored.
- Multiple RF-003 gateways are not supported.
- Valkey runtime state is ephemeral in the Home Assistant app package.
