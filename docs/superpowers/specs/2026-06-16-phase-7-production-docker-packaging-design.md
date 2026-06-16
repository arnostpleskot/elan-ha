# Phase 7 Production Docker Packaging Design

## Purpose

Phase 7 hardens the Docker packaging for production-like deployment while keeping the application architecture unchanged. The bridge remains configured through environment variables, communicates with RF-003 through the existing BullMQ worker path, and exposes Home Assistant entities only through MQTT Discovery and MQTT state/command topics.

Home Assistant Supervisor add-on packaging remains out of scope for this phase.

## Scope

Phase 7 includes:

- A production-grade multi-stage Docker image.
- A production-like default Docker Compose file for the bridge and Valkey.
- A dedicated development Docker Compose file.
- README updates that separate production-like and development Docker usage.

Phase 7 does not include:

- Home Assistant add-on metadata or Supervisor API integration.
- Bundling Mosquitto, Home Assistant, or Zigbee2MQTT in this repository.
- Application behavior changes unless required by container packaging.

## Docker Image

The `Dockerfile` should become a multi-stage build:

1. Builder stage installs dependencies from `package.json` and `bun.lock` with `bun install --frozen-lockfile`.
2. Builder stage copies source, scripts, and TypeScript config so Docker type-checking covers the same files as local type-checking.
3. Builder stage runs the project verification needed to produce a reliable image: tests, type-check, and build.
4. Runtime stage contains only the files needed to run the built app.
5. Runtime stage starts the app with `bun dist/index.js`.

The runtime image should:

- Run as a non-root user.
- Expose port `3000`.
- Include a `HEALTHCHECK` that calls `GET /healthz` on the local app port.
- Avoid copying `.env`, local logs, host `node_modules`, or secrets.

## Compose Files

Use `docker-compose.yml` as the default production-like Compose file because that is the common deployment path.

`docker-compose.yml` should provide:

- Services: `app` and `valkey`.
- App uses the hardened image build.
- Valkey uses a persistent named volume.
- Both services use `restart: unless-stopped`.
- App listens on internal port `3000` and maps host port through `APP_HTTP_PORT`.
- App receives `VALKEY_URL=redis://valkey:6379` by default.
- MQTT remains external and configured through `MQTT_URL`, `MQTT_USERNAME`, and `MQTT_PASSWORD`.

Add `docker-compose.dev.yml` for development:

- Services: `app` and `valkey`.
- App builds from the local Dockerfile and can use the same environment variables as production.
- Valkey is ephemeral and can keep persistence disabled with `--save "" --appendonly no`.
- The file is intended for local iteration, not long-running deployment.

This keeps Mosquitto/Home Assistant deployment independent while still allowing the bridge to point at a Home Assistant Mosquitto add-on once it exists.

## Valkey Persistence And Restart Behavior

Valkey is an in-memory database while running, but production-like deployment should persist it to disk through a named Docker volume. The bridge stores BullMQ metadata, discovered device registry, cached device state, and bridge metadata in Valkey.

If only the app restarts while Valkey keeps running, the device registry and queue metadata remain available.

If the whole stack restarts with persistent Valkey, the registry and queue metadata survive container recreation.

If Valkey is ephemeral and is recreated, the app will enqueue forced discovery at startup and rebuild the registry from RF-003. Home Assistant remapping should not be required as long as RF-003 device IDs and generated MQTT Discovery identifiers remain stable, but there can be a temporary discovery/state gap until RF-003 rediscovery succeeds and MQTT Discovery is republished.

## Documentation

Update `README.md` to document:

- Production-like runtime: `docker compose up --build`.
- Development runtime: `docker compose -f docker-compose.dev.yml up --build`.
- Required external services: RF-003 gateway, MQTT broker, and Home Assistant MQTT integration.
- Valkey persistence in the default Compose file and ephemeral Valkey in the development Compose file.
- Health and readiness checks with `curl http://localhost:<APP_HTTP_PORT>/healthz` and `/readyz`.

## Verification

Phase 7 is verified with:

- `bun test`
- `bun run typecheck`
- `bun run build`
- `docker build .`
- `docker compose config`
- `docker compose -f docker-compose.dev.yml config`

If Docker daemon access is unavailable, record that limitation and rely on the Bun checks plus Compose config validation if available.

## Future Work

Home Assistant add-on packaging can build on this phase later by adding add-on metadata and a small options-to-environment wrapper. That later work should not require changing the bridge core modules.
