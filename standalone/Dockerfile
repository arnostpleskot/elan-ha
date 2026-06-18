FROM oven/bun:1.3.11-alpine AS deps

WORKDIR /app

COPY elan-ha/package.json elan-ha/bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS builder

COPY elan-ha/tsconfig.json ./
COPY elan-ha/src ./src
COPY elan-ha/scripts ./scripts

RUN bun test src/app src/config src/devices src/gateway src/http src/mqtt src/observability src/queue src/storage
RUN bun run typecheck
RUN bun run build

FROM oven/bun:1.3.11-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY elan-ha/package.json elan-ha/bun.lock ./
RUN bun install --frozen-lockfile --production

COPY --from=builder /app/dist ./dist

USER bun

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e "try { const response = await fetch('http://127.0.0.1:3000/healthz'); process.exit(response.ok ? 0 : 1); } catch { process.exit(1); }"

CMD ["bun", "dist/index.js"]
