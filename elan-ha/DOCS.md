# eLAN RF-003 MQTT Bridge Documentation

## Requirements

- Home Assistant Supervisor.
- The Home Assistant MQTT app is required and must be configured before this app starts.
- RF-003 gateway reachable from the Home Assistant app container.

## Configuration

| Option | Description |
| --- | --- |
| `rf003_base_url` | RF-003 gateway URL, for example `http://192.168.1.50`. This must be a valid `http://` or `https://` URL. |
| `rf003_username` | RF-003 username. |
| `rf003_password` | RF-003 password. |
| `mqtt_discovery_prefix` | MQTT Discovery prefix. Keep `homeassistant` unless your Home Assistant MQTT integration uses a different prefix. |
| `mqtt_base_topic` | Bridge MQTT state and command base topic. Default: `inels`. |
| `poll_full_state_interval_ms` | Full state poll interval in milliseconds. Default: `60000`. |
| `poll_device_state_interval_ms` | Per-device state poll interval in milliseconds. Default: `300000`. |
| `log_level` | Bridge log level: `trace`, `debug`, `info`, `warn`, `error`, or `fatal`. |

The app reads MQTT host, port, username, and password from the Supervisor MQTT service. Manual MQTT broker configuration is available through the standalone Docker Compose deployment, not this Home Assistant app package.

## Installation

1. In Home Assistant Supervisor, open the app store repository settings.
2. Add `https://github.com/arnostpleskot/elan-ha` as an app repository.
3. Install the `eLAN RF-003 MQTT Bridge` app.
4. Configure the RF-003 options.
5. Start the app.

The app `config.yaml` references the GHCR image name. The publishing workflow is responsible for publishing that image.

## RF-003 Network Access

Use the RF-003 IP address if local DNS or mDNS names do not resolve from inside the app container. For example, prefer `http://192.168.1.50` over `http://rf003.local` when troubleshooting startup connectivity.

## Logs And Diagnostics

Diagnostics are written to stdout/stderr and are visible in Supervisor logs. Use `debug` or `trace` log level only while troubleshooting because these levels include sanitized RF-003 and MQTT boundary details.

Discovered devices are exposed through MQTT Discovery and appear in Home Assistant's normal device and entity UI. The app does not provide an ingress UI or separate device list page.

## Restart Behavior

The app runs an internal ephemeral Valkey instance for BullMQ and runtime cache. Valkey is not persisted. After restart, the bridge reads RF-003 again, rebuilds its supported device registry, and republishes MQTT Discovery. Home Assistant entity remapping should not be required as long as RF-003 device identities remain stable.
