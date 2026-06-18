FROM oven/bun:1.3.11-alpine AS deps

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS builder

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

RUN bun run build

FROM ghcr.io/home-assistant/base:3.22

ARG BUILD_VERSION=0.1.0
ARG BUILD_ARCH=amd64

LABEL \
  io.hass.version="${BUILD_VERSION}" \
  io.hass.type="app" \
  io.hass.arch="${BUILD_ARCH}"

WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache ca-certificates libstdc++ valkey

COPY --from=deps /usr/local/bin/bun /usr/local/bin/bun
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY --from=builder /app/dist ./dist
COPY init.sh /init
COPY run.sh /run.sh
RUN chmod a+x /run.sh /init

CMD ["/run.sh"]
