# Home Assistant Repository Publishing Design

## Context

`elan-ha` currently works as a manually copied local Home Assistant app package: the repository root contains `config.yaml`, `Dockerfile`, `run.sh`, `DOCS.md`, and `CHANGELOG.md`. That layout is suitable for copying to `/addons/elan-ha`, but it is not the expected layout for a public Home Assistant app repository.

Home Assistant app repositories require a root `repository.yaml`. Each app then lives in its own subdirectory with its own `config.yaml`, app Dockerfile, README, documentation, changelog, and optional presentation/security files. The project also needs GitHub Actions gates and a GHCR publishing flow before `main` can be protected with required checks.

The current technical baseline is healthy: `bun test`, `bun run typecheck`, `bun run build`, `bun audit`, and the root Home Assistant Docker build pass locally. No tracked secrets were found. The local `.env` contains private network values but is ignored and not tracked. The public GitHub repository exists, but local `main` is not yet pushed/tracking upstream, so branch protection cannot be enabled until the branch exists remotely.

## Goals

- Convert the repository into a valid Home Assistant app repository.
- Keep one repository for both source code and Home Assistant app packaging.
- Preserve root-level developer documentation for GitHub users and contributors.
- Add app-level Home Assistant presentation files under the app folder.
- Add CI checks for tests, typecheck, lint, and Docker build validation.
- Add a GHCR publishing workflow for multi-architecture Home Assistant app images.
- Prepare branch protection so `main` cannot merge without required checks after the branch is pushed.

## Non-Goals

- Do not create a separate Home Assistant repository wrapper yet.
- Do not add a Home Assistant custom integration, HACS integration, or direct Home Assistant API integration.
- Do not add an ingress UI for the app.
- Do not make Valkey external in the Home Assistant app package.
- Do not publish images manually as part of the code change; publishing should happen through GitHub Actions.

## Repository Layout

The repository root becomes the Home Assistant repository root. The `elan-ha/` subdirectory becomes a self-contained Home Assistant app package and application source root so Home Assistant's builder actions can build it with `./elan-ha` as the Docker context.

```text
repository.yaml
README.md
.github/workflows/
elan-ha/
|-- config.yaml
|-- Dockerfile
|-- package.json
|-- bun.lock
|-- tsconfig.json
|-- src/
|-- scripts/
|-- run.sh
|-- init.sh
|-- README.md
|-- DOCS.md
`-- CHANGELOG.md
standalone/
|-- Dockerfile
`-- docker-compose.yml
```

Root `README.md` is GitHub-facing. It should describe the project architecture, supported device model, development commands, standalone Docker Compose, and the release workflow at a contributor level.

`elan-ha/README.md` is Home Assistant Store-facing. It should be short and user-oriented: what the app does, requirements, MQTT Discovery behavior, and where to find detailed app docs.

`elan-ha/DOCS.md` is Home Assistant app documentation. It should cover installation through the Home Assistant app repository flow, configuration options, MQTT service dependency, RF-003 network access, discovery/restart behavior, and troubleshooting.

`elan-ha/CHANGELOG.md` is the app upgrade changelog shown to Home Assistant users.

## Home Assistant Repository Metadata

Add root `repository.yaml`:

```yaml
name: eLAN RF-003 Home Assistant Apps
url: https://github.com/arnostpleskot/elan-ha
maintainer: Arnost Pleskot
```

The maintainer value should be adjusted during implementation if a public contact email should be included.

The app `config.yaml` should move to `elan-ha/config.yaml` and include a public image reference once the GHCR workflow is ready:

```yaml
image: ghcr.io/arnostpleskot/elan-ha
```

The app remains headless and should continue not to request unnecessary privileges. It should not add `host_network`, `ports`, `homeassistant_api`, `hassio_api`, `docker_api`, `full_access`, or privileged capabilities.

## Docker Build Model

The Home Assistant app Dockerfile moves to `elan-ha/Dockerfile`. It should build with `elan-ha/` as the Docker build context, matching Home Assistant's builder actions. The app source, Bun package files, TypeScript config, scripts, and HA package files should all live under `elan-ha/` so local repository builds and GHCR publishing use the same context.

The Dockerfile should use local app-context paths:

```dockerfile
COPY package.json bun.lock ./
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY config.yaml run.sh ./
COPY init.sh /init
COPY run.sh /run.sh
```

The runtime should continue to use `ghcr.io/home-assistant/base:3.22`, install only required Alpine packages, run internal loopback-only Valkey, and execute the built Bun bundle.

The standalone Docker Compose runtime remains under `standalone/`, but its Dockerfile should build from the self-contained `elan-ha/` source tree. It is not the published Home Assistant app image.

## CI Workflow

Add `.github/workflows/ci.yml` for pull requests and pushes to `main`.

Required checks:

- Install dependencies with `bun install --frozen-lockfile`.
- Run `bun test`.
- Run `bun run typecheck`.
- Run `bun run lint`.
- Run `bun run build`.
- Build the Home Assistant app Docker image from `elan-ha/Dockerfile` with `elan-ha/` context.
- Build the standalone Docker image from `standalone/Dockerfile` using the updated `elan-ha/` source paths.

`lint` should become a real lint command instead of an alias for typecheck. The preferred minimal choice is `oxlint` because it is fast and small. The workflow should fail if lint violations are introduced.

## GHCR Publishing Workflow

Add `.github/workflows/publish.yml` for releases and manual dispatch.

The workflow should use Home Assistant's maintained builder actions where feasible, following the Home Assistant app publishing docs. It should publish `ghcr.io/arnostpleskot/elan-ha` as the generic multi-architecture manifest and per-architecture images as needed by the builder.

Workflow permissions:

```yaml
permissions:
  contents: read
  packages: write
```

The workflow should build the supported `config.yaml` architectures:

- `aarch64`
- `amd64`

The app image should be public in GHCR so Home Assistant users can pull it without authentication. Publishing rights remain controlled by the repository and GHCR package permissions; external users cannot overwrite the image.

## Branch Protection

Branch protection is a GitHub-side setting and cannot be fully applied until `main` exists on GitHub. After pushing local `main`, protect it with these rules:

- Require pull request before merging.
- Require status checks to pass before merging.
- Require the CI workflow checks for tests, typecheck, lint, build, and Docker validation.
- Require branches to be up to date before merging if that does not slow solo development too much.
- Disallow force pushes.
- Keep secret scanning and push protection enabled.

Dependabot security updates should be enabled if available for the repository.

## Home Assistant Security Settings

Do not add a custom `apparmor.txt` in this phase. The app does not need host filesystem access, device mounts, privileged capabilities, Docker API access, Home Assistant API access, host networking, or ingress. A custom AppArmor profile would add operational risk and require real Home Assistant audit-log iteration before it is trustworthy.

Security should be enforced by keeping the app's `config.yaml` minimal and not disabling Home Assistant's default confinement. The app should not set `apparmor: false`, `host_network`, `ports`, `homeassistant_api`, `hassio_api`, `docker_api`, `full_access`, privileged capabilities, or mapped host volumes.

A custom AppArmor profile can be revisited after the published app workflow is stable if there is a clear reason to tighten the profile further and time to test it on real Home Assistant hardware.

## Tests

Update `src/ha-app/package.test.ts` to assert the new repository layout:

- root `repository.yaml` exists and contains repository metadata;
- app package, Bun package files, TypeScript config, scripts, and source files exist under `elan-ha/`;
- root no longer contains app package or Bun source files except root `README.md` and repository-level metadata;
- `elan-ha/config.yaml` declares the app image and does not request unnecessary privileges;
- `elan-ha/Dockerfile` copies app-local files correctly;
- app README, DOCS, and CHANGELOG exist under `elan-ha/`;
- GitHub workflow files exist;
- `elan-ha/package.json` has separate `lint` and `typecheck` scripts.

Existing pure module tests should not need behavior changes.

## Verification

Implementation should be verified with:

```bash
bun install --frozen-lockfile
bun test
bun run typecheck
bun run lint
bun run build
docker build -t elan-ha-ha-app:local elan-ha
docker build -f standalone/Dockerfile -t elan-ha-standalone:local .
```

After pushing `main`, verify GitHub Actions on the remote branch and then configure branch protection against the actual check names reported by GitHub.

## Risks And Mitigations

- The HA app folder move can break imports, tests, or Docker copy paths. Mitigate with package tests, app-local Bun checks, and a real `docker build elan-ha` check.
- The Home Assistant builder action builds from the app directory context. Mitigate by making `elan-ha/` self-contained and testing the workflow with `workflow_dispatch` before relying on releases.
- A custom AppArmor profile is deferred. Mitigate by relying on Home Assistant's default confinement and keeping the app's requested privileges low.
- `main` branch protection cannot be enabled until the branch is pushed. Mitigate by adding workflows first, pushing once, then applying protection with the observed check names.
