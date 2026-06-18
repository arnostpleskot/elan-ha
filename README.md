# elan-ha

Home Assistant app repository for an iNELS RF-003 to MQTT bridge.

This repository contains the Home Assistant Supervisor app package in `elan-ha/` and a standalone Docker Compose runtime in `standalone/`. The bridge talks to an RF-003 gateway, serializes gateway access through BullMQ and Valkey, and exposes supported devices to Home Assistant through MQTT Discovery.

## Repository Layout

- `repository.yaml`: Home Assistant app repository metadata.
- `elan-ha/`: Home Assistant app package, Bun/TypeScript source, tests, and app Dockerfile.
- `standalone/docker-compose.yml`: standalone runtime for non-Supervisor deployments.
- `standalone/Dockerfile`: standalone container build using the app source from `elan-ha/`.
- `docs/`: planning and design notes.

The repository root is not itself the Home Assistant app package. Home Assistant installs the app from the `elan-ha/` package directory after this repository is added as an app repository.

## Home Assistant Installation

In Home Assistant Supervisor, add this repository as an app repository:

```text
https://github.com/arnostpleskot/elan-ha
```

Then install the `eLAN RF-003 MQTT Bridge` app, configure RF-003 access, and start it. The app uses the Supervisor MQTT service, so the Home Assistant MQTT app must already be installed and configured.

Published app images are expected to come from GHCR. The app package references the published image name in `elan-ha/config.yaml`.

## Standalone Runtime

For non-Supervisor environments, use the standalone Docker Compose stack from the repository root:

```bash
cp .env.example .env
docker compose -f standalone/docker-compose.yml up --build
docker compose -f standalone/docker-compose.yml down
```

The standalone stack runs the bridge and Valkey. Home Assistant and MQTT broker services are external and configured through environment variables.

## Development

Run Bun commands from the app package directory:

```bash
cd elan-ha
bun install
bun run dev
bun test
bun run typecheck
bun run lint
bun run build
```

Useful local checks:

```bash
cd elan-ha
bun test src/ha-app/package.test.ts
```

## Bridge Behavior

RF-003 is the source of truth for device inventory and state. The bridge only exposes RF-003-discovered devices it can classify as supported Home Assistant entities.

All RF-003 communication is serialized through BullMQ with worker concurrency `1` to avoid session races, RF transmission collisions, and gateway overload. Runtime registry and queue metadata are stored in Valkey.

Supported entities are published through Home Assistant MQTT Discovery, with state and command topics under the configured MQTT base topic.
