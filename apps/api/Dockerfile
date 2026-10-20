# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS base

RUN corepack enable

ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"

WORKDIR /workspace

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
COPY apps/api/package.json apps/api/package.json
COPY apps/api/workerhole/package.json apps/api/workerhole/package.json
COPY packages/workerhole/package.json packages/workerhole/package.json
COPY packages/response/package.json packages/response/package.json
COPY packages/auth-schemas/package.json packages/auth-schemas/package.json

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
	pnpm install --frozen-lockfile --ignore-scripts --filter '@cataqui/api...' \
	&& pnpm rebuild esbuild prisma @prisma/engines

FROM deps AS build

ARG DATABASE_OWNER_DIRECT_URL=postgresql://dummy:dummy@localhost:5432/dummy

COPY tsconfig.base.json ./
COPY apps/api/package.json apps/api/nest-cli.json apps/api/prisma.config.ts apps/api/tsconfig*.json ./apps/api/
COPY apps/api/prisma ./apps/api/prisma
COPY apps/api/src ./apps/api/src
COPY apps/api/workerhole ./apps/api/workerhole
COPY packages/workerhole ./packages/workerhole
COPY packages/response ./packages/response
COPY packages/auth-schemas ./packages/auth-schemas

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
	pnpm --filter @cataqui/api prisma:generate \
	&& pnpm --filter '@cataqui/api^...' build \
	&& pnpm --filter @cataqui/api build:nest \
	&& pnpm deploy --filter @cataqui/api --prod /prod/api

FROM node:24-alpine AS runtime

RUN apk add --no-cache tini wget
RUN addgroup -g 1001 -S cataqui \
	&& adduser -S cataqui -u 1001 -G cataqui

WORKDIR /app

COPY --from=build --chown=cataqui:cataqui /prod/api ./

ENV NODE_ENV=production

USER cataqui

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
	CMD wget --no-verbose --tries=1 --spider http://localhost:3000/v1/health/live || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
