# Observability And Ephemeral Valkey Design

## Purpose

This follow-up reduces expected log noise, improves debug visibility at RF-003 and MQTT boundaries, and makes Valkey ephemeral by default to protect flash or memory-card storage.

RF-003 remains the durable source of truth for device inventory and state. Stable `sourceAddress`-based Home Assistant identities from Phase 8 allow the bridge to rebuild MQTT Discovery after restart without relying on a persisted Valkey registry.

## Current Behavior

- RF-003 retryable HTTP `401` responses are logged at `warn`, even though session expiry is expected roughly every 30 minutes.
- Development logs are readable through `pino-pretty`, while production JSON logs use Pino's default numeric `time` field.
- RF-003 and MQTT debug logging is partial. MQTT inbound messages are logged, but outbound publishes are not consistently visible. RF-003 requests and responses are not logged in detail.
- Pino redaction is not configured centrally.
- Production Compose starts Valkey with append-only persistence and a named volume. Valkey can periodically save to disk, increasing write activity on flash-backed deployments. `docker-compose.dev.yml` exists mainly to provide ephemeral Valkey, so it becomes redundant when the default Compose stack is ephemeral.
- Registry and state writes use unconditional `set`, so repeated discovery or polling can dirty Valkey even when values are unchanged.

## Storage Direction

Valkey should be ephemeral by default for the current Docker runtime.

Default `docker-compose.yml` should run Valkey without RDB snapshots or append-only persistence:

```text
valkey-server --save "" --appendonly no
```

The default Compose file should not create a persistent Valkey data volume.

Remove `docker-compose.dev.yml` as part of this follow-up. Its main purpose was to provide an ephemeral Valkey stack while production Compose used persistence. Once the default Compose stack is ephemeral, maintaining a second Compose file adds duplication without enough value. Developers can use normal Docker Compose commands against the single default stack:

```text
docker compose up --build
docker compose down
```

The bridge should recover from a full stack restart by enqueueing startup discovery, reading RF-003 inventory, republishing retained MQTT Discovery, and repopulating runtime metadata. Stable address-based entity IDs prevent Home Assistant remapping as long as RF-003 addresses remain stable.

Durable Valkey configuration is deferred until Home Assistant add-on/app packaging, where storage policy can be exposed deliberately to users.

## Write Reduction

Even with ephemeral Valkey, unnecessary writes should be avoided.

Add a small storage helper that writes a key only when the serialized value differs from the current value. Use it for:

- `inels:devices`
- `inels:state:<device>`
- `inels:meta:last_poll`
- `inels:meta:last_success`

This reduces dirty pages, background persistence activity when users later enable persistence, and avoidable write churn during repeated discovery or polling.

The helper should preserve the current failure model: write failures still reject so BullMQ retries the job. Read failures during compare-before-set should not silently hide a write; if the comparison read fails, let the operation fail rather than guessing.

## RF-003 Logging

The first retryable RF-003 HTTP `401` should be logged at `info`, not `warn`:

```text
received 401, re-authenticating
```

This is expected session renewal behavior. A failed login, a second `401` after re-authentication, network errors, or protocol errors should remain visible through existing error paths.

RF-003 debug logging should include sanitized request and response metadata:

- path
- method
- status
- response content type when available
- parsed response payload when safe and useful

Login request bodies must not be logged raw because they contain username and SHA-1 password key material. Cookie and authorization headers must be redacted.

## MQTT Logging

MQTT debug logging should cover both directions:

- inbound broker messages received by the bridge
- outbound bridge publishes for availability, discovery, discovery cleanup, and state

Log topic, retain flag, and payload at `debug`. Existing warning logs for invalid command payloads and dropped commands remain warning-level.

## Redaction

Configure Pino redaction centrally in the root logger.

Redact known sensitive fields and common nested variants:

- RF-003 password
- MQTT password
- form `key` values
- cookies
- authorization headers
- nested `password`, `key`, `cookie`, and `authorization` fields in logged objects

Redaction should apply to both production JSON logs and development `pino-pretty` logs.

## Timestamp Policy

Keep Pino's default numeric `time` in production JSON logs. It is machine-friendly and works well with Docker, Loki, Grafana, and other log shippers.

Development logs already use `pino-pretty` with readable timestamps. Do not add an ISO timestamp option in this follow-up unless raw production container logs become the primary consumption path.

## Testing Focus

Add or update tests for:

- RF-003 retryable `401` logs at `info` instead of `warn`.
- RF-003 debug request/response logs are emitted without sensitive fields.
- Logger redaction configuration includes expected sensitive paths.
- MQTT outbound publish debug logs include topic, retain flag, and payload.
- Valkey compare-before-set skips writes when values are unchanged and writes when changed.
- Docker Compose default Valkey command disables RDB and append-only persistence and does not declare a Valkey data volume.
- `docker-compose.dev.yml` is removed and documentation no longer points developers to a separate dev Compose stack.

## Out Of Scope

- Persistent Valkey profiles or user-facing storage configuration.
- Home Assistant add-on storage configuration.
- Changing production timestamp format to ISO.
- Full distributed tracing or OpenTelemetry.
- Logging raw RF-003 login payloads, cookies, MQTT credentials, or authorization headers.
