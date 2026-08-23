# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS base

RUN apk add --no-cache tini
RUN corepack enable && corepack prepare pnpm@11.4.0 --activate

ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"

WORKDIR /workspace

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/workers/geosearch/package.json apps/workers/geosearch/package.json
COPY apps/workers/webhooks/package.json apps/workers/webhooks/package.json
COPY packages/api-internal-ingress/package.json packages/api-internal-ingress/package.json
COPY packages/microservices-auth-contracts/package.json packages/microservices-auth-contracts/package.json

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
	pnpm install --frozen-lockfile --ignore-scripts \
	&& pnpm rebuild esbuild prisma @nestjs/core @prisma/engines unrs-resolver

FROM deps AS build

ARG DATABASE_OWNER_DIRECT_URL=postgresql://dummy:dummy@localhost:5432/dummy

COPY . .

RUN pnpm --filter @cataqui/api prisma:generate \
	&& pnpm --filter "./packages/*" build \
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
CMD ["node", "dist/src/main.js"]
