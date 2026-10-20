# syntax=docker/dockerfile:1.7

FROM node:24.20.0-bookworm-slim AS node-build-runtime
FROM ruby:4.0.7-slim-bookworm AS ruby-build-runtime

# Ruby owns build automation; Node owns the application and its SDK adapters.
# Both official images use Bookworm. Ruby stays in build stages only.
FROM ruby-build-runtime AS dependencies
# Frozen installs own dependencies, including Git dependency build hooks.
ENV pnpm_config_verify_deps_before_run=false
COPY --from=node-build-runtime /usr/local/ /usr/local/
RUN apt-get update && apt-get install --no-install-recommends -y ca-certificates git libstdc++6 \
	&& rm -rf /var/lib/apt/lists/* \
	&& corepack enable pnpm
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
COPY apps/mapshot/package.json apps/mapshot/package.json
COPY apps/mapshot/workerhole/package.json apps/mapshot/workerhole/package.json
COPY packages/async/package.json packages/async/package.json
COPY packages/workerhole/package.json packages/workerhole/package.json
COPY packages/places/package.json packages/places/package.json
RUN --mount=type=cache,id=mapshot-pnpm,target=/root/.local/share/pnpm/store \
	pnpm install --frozen-lockfile --filter '@cataqui/mapshot...'

# Match the owned engine's pinned toolchain; Cargo.lock also pins libwebp 1.6.0.
FROM rust:1.97.1-slim-bookworm@sha256:2775a09d208ff0d7c1f50490c45b62db929e87ba1dcbc3f2132ac71a704bcdd3 AS engine-build
ENV CARGO_BUILD_JOBS=2
COPY --from=ruby-build-runtime /usr/local/bin/ruby /usr/local/bin/ruby
COPY --from=ruby-build-runtime /usr/local/lib/ /usr/local/lib/
RUN apt-get update && apt-get install --no-install-recommends -y build-essential cmake pkg-config curl ca-certificates \
	libffi8 libgmp10 libyaml-0-2 libgdbm6 libgdbm-compat4 libreadline8 libssl3 zlib1g \
	&& rm -rf /var/lib/apt/lists/*
WORKDIR /engine
COPY LICENSE /LICENSE
COPY apps/mapshot/renderer/cargo-about.version apps/mapshot/renderer/cargo-about.sha256 ./
COPY apps/mapshot/build/engine/install-cargo-about.rb apps/mapshot/build/engine/build-engine.rb /build/
RUN ruby /build/install-cargo-about.rb --engine-root /engine
COPY apps/mapshot/renderer/about.toml apps/mapshot/renderer/notices.hbs ./
COPY apps/mapshot/renderer/Cargo.toml apps/mapshot/renderer/Cargo.lock apps/mapshot/renderer/rust-toolchain.toml ./
COPY apps/mapshot/renderer/src ./src
# Cargo.lock verifies these archives; preserve notices outside the selected license texts too.
# Docker owns source invalidation; retain dependency artifacts, but rebuild the
# owned crate when this content-addressed layer executes.
RUN --mount=type=cache,id=mapshot-engine-cargo-registry,target=/usr/local/cargo/registry \
	--mount=type=cache,id=mapshot-engine-cargo-target-amd64,target=/engine/target,sharing=locked \
	ruby /build/build-engine.rb --engine-root /engine --destination /engine-output

# FontTools and Ruby own preparation; it needs no application dependency install.
FROM ruby-build-runtime AS prepared-assets
WORKDIR /workspace
RUN apt-get update && apt-get install --no-install-recommends -y python3 python3-venv \
    && rm -rf /var/lib/apt/lists/*
COPY apps/mapshot/build/fonts/requirements.txt /tmp/font-requirements.txt
RUN python3 -m venv /opt/font-tools \
    && /opt/font-tools/bin/python3 -m pip install --no-cache-dir --require-hashes -r /tmp/font-requirements.txt
ENV PATH="/opt/font-tools/bin:${PATH}"
COPY apps/mapshot/build/fonts ./apps/mapshot/build/fonts
RUN ruby -r ./apps/mapshot/build/fonts/font-assets -e 'MapshotFontAssets.new.prepare'

FROM dependencies AS build-environment
COPY LICENSE ./LICENSE
# Keep source artifacts out of the renderer build cache. Verified worldwide
# indexes are appended once, in their own layers, by the image packaging step.
COPY tsconfig.base.json vitest.shared.ts ./
COPY packages/async ./packages/async
COPY packages/workerhole ./packages/workerhole
COPY packages/places ./packages/places
COPY apps/mapshot/package.json apps/mapshot/Dockerfile apps/mapshot/vitest.config.ts apps/mapshot/rspack.config.ts apps/mapshot/tsconfig*.json ./apps/mapshot/
COPY apps/mapshot/src ./apps/mapshot/src
COPY apps/mapshot/workerhole ./apps/mapshot/workerhole
COPY apps/mapshot/build ./apps/mapshot/build
COPY apps/mapshot/scripts ./apps/mapshot/scripts
COPY apps/mapshot/test ./apps/mapshot/test
COPY apps/mapshot/renderer ./apps/mapshot/renderer
RUN pnpm --filter '@cataqui/mapshot^...' build

FROM prepared-assets AS packaged-fonts
RUN ruby -r ./apps/mapshot/build/fonts/font-assets -e 'MapshotFontAssets.new.package(destination: "/fonts")'

FROM build-environment AS tooling-build
RUN ruby apps/mapshot/build/build-mapshot.rb --tools

FROM scratch AS tooling-export
COPY --from=tooling-build /workspace/apps/mapshot/dist/tools /dist/tools

FROM tooling-build AS verification-environment

FROM verification-environment AS typecheck
RUN cd apps/mapshot && pnpm exec tsc --noEmit \
	&& pnpm exec tsc --noEmit -p build/tsconfig.json

FROM verification-environment AS test
RUN cd apps/mapshot && pnpm exec vitest run

FROM verification-environment AS coverage
RUN cd apps/mapshot && pnpm exec vitest run --coverage

FROM scratch AS coverage-export
COPY --from=coverage /workspace/apps/mapshot/coverage /

FROM scratch AS notices-export
COPY --from=engine-build /engine-output/licenses /

FROM build-environment AS build
COPY --from=prepared-assets /workspace/apps/mapshot/generated ./apps/mapshot/generated
COPY --from=engine-build /engine-output /engine-output
WORKDIR /workspace/apps/mapshot
RUN ruby build/build-mapshot.rb --renderer --native-test
RUN --mount=type=cache,id=mapshot-pnpm,target=/root/.local/share/pnpm/store \
	pnpm --dir /workspace deploy --filter @cataqui/mapshot --prod /prod/mapshot
RUN ruby -rfileutils <<'RUBY'
FileUtils.mkdir_p(["/prod/mapshot/bin", "/prod/mapshot/licenses/engine"])
FileUtils.cp("/engine-output/mapshot-renderer", "/prod/mapshot/bin/mapshot-renderer")
FileUtils.cp_r("/engine-output/licenses/.", "/prod/mapshot/licenses/engine")
RUBY
RUN MAPSHOT_RENDERER_PATH=/prod/mapshot/bin/mapshot-renderer \
	MAPSHOT_FONT_DIR=/prod/mapshot/dist/native/assets/fonts \
	node --test --test-concurrency=1 --test-timeout=30000 /workspace/apps/mapshot/dist/native-test/engine.integration.mjs

FROM engine-build AS engine-test
COPY apps/mapshot/renderer/tests ./tests
COPY --from=packaged-fonts /fonts /fonts
RUN --mount=type=cache,id=mapshot-engine-cargo-registry,target=/usr/local/cargo/registry \
	--mount=type=cache,id=mapshot-engine-cargo-target-amd64,target=/engine/target,sharing=locked \
	cargo clean --package mapshot-renderer --locked \
	&& MAPSHOT_FONT_DIR=/fonts cargo test --locked --all-targets

# Keep the development command's two qualification gates while allowing Cargo
# tests and the Node integration build to execute as independent branches.
FROM engine-test AS native-test
COPY --from=build /prod/mapshot/bin/mapshot-renderer /verified-mapshot-renderer

FROM node:24.20.0-bookworm-slim AS runtime
RUN apt-get update && apt-get install --no-install-recommends -y ca-certificates tini \
	&& rm -rf /var/lib/apt/lists/* \
	&& groupadd --gid 1001 cataqui \
	&& useradd --uid 1001 --gid cataqui --create-home cataqui
WORKDIR /app
COPY --from=build --chown=cataqui:cataqui /prod/mapshot/node_modules ./node_modules
COPY --from=build --chown=cataqui:cataqui /prod/mapshot/dist/native ./dist/native
COPY --from=build --chown=cataqui:cataqui /prod/mapshot/bin ./bin
COPY --from=build --chown=cataqui:cataqui /prod/mapshot/licenses ./licenses
COPY --from=build --chown=cataqui:cataqui /prod/mapshot/package.json ./package.json
ENV NODE_ENV=production MAPSHOT_RENDERER_PATH=/app/bin/mapshot-renderer MAPSHOT_FONT_DIR=/app/dist/native/assets/fonts
USER cataqui
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
	CMD node --input-type=module -e "const response=await fetch('http://127.0.0.1:8080/health',{signal:AbortSignal.timeout(3000)});if(!response.ok)process.exit(1)"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/native/server.mjs"]
