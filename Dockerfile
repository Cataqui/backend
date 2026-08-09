# ─── base ──────────────────────────────────────────────────────────────
FROM node:24-alpine AS base

RUN apk add --no-cache tini

RUN corepack enable && corepack prepare pnpm@11.4.0 --activate

ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"

WORKDIR /app

# ─── deps ──────────────────────────────────────────────────────────────
FROM base AS deps

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts \
    && pnpm rebuild esbuild prisma @nestjs/core @prisma/engines unrs-resolver

# ─── build ─────────────────────────────────────────────────────────────
FROM deps AS build

ARG DATABASE_OWNER_DIRECT_URL=postgresql://dummy:dummy@localhost:5432/dummy

COPY . .

RUN pnpm prisma:generate \
    && pnpm build \
    && pnpm prune --prod --ignore-scripts

# ─── runtime ───────────────────────────────────────────────────────────
FROM node:24-alpine AS runtime

RUN apk add --no-cache tini wget

RUN addgroup -g 1001 -S cataqui \
    && adduser -S cataqui -u 1001 -G cataqui

WORKDIR /app

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/generated ./generated
COPY --from=build /app/package.json ./

ENV NODE_ENV=production

USER cataqui

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/v1/health/live || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/src/main.js"]
