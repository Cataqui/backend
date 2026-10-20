import { AppError, AppErrorCode, RenderingResourceUnavailableError } from "../../src/errors/index";
import "reflect-metadata";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, before, it } from "node:test";
import * as td from "testdouble";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { EngineAssetsService } from "../../src/renderer/engine-assets.service";
import { RendererProcessRepository } from "../../src/renderer/renderer-process.repository";
import { RendererService } from "../../src/renderer/renderer.service";
import type { MapshotRenderInput } from "@cataqui/mapshot-workerhole";
import { createEngineFixtureRenderer, loadEngineFixture } from "./engine-fixture";

afterEach(() => td.reset());

const _hash = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
const _directory = fileURLToPath(new URL("./fixtures/owned-renderer/", import.meta.url));
const _fixture = await loadEngineFixture({ directory: _directory });
const _assetsDirectory =
	process.env["MAPSHOT_ASSETS_DIR"] ??
	(process.env["MAPSHOT_FONT_DIR"] === undefined
		? fileURLToPath(new URL("../native/assets/", import.meta.url))
		: dirname(process.env["MAPSHOT_FONT_DIR"]));

before(() => {
	assert.equal(process.platform, "linux", "Run the actual renderer gate inside the Mapshot Linux image.");
	assert.equal(process.arch, "x64");
	assert.equal(Number(process.versions.node.split(".")[0]), 24);
});

function _input(): MapshotRenderInput {
	const snapshot = _fixture.manifest.snapshots[0];
	assert.ok(snapshot);
	return _fixture.getInput({ snapshot: snapshot });
}

async function _save(params: { id: string; bytes: Uint8Array }): Promise<void> {
	const directory = process.env["MAPSHOT_TEST_OUTPUT"];
	if (directory === undefined) return;
	await mkdir(directory, { recursive: true });
	await writeFile(join(directory, `${params.id}.webp`), params.bytes);
	await sharp(params.bytes)
		.png()
		.toFile(join(directory, `${params.id}.png`));
}

it("initializes the real shaping, raster and WebP boundary without geographic reads", async () => {
	const context = await createEngineFixtureRenderer({ fixture: _fixture, assetsDirectory: _assetsDirectory });
	try {
		await context.engine.start({ signal: AbortSignal.timeout(30_000) });
		assert.equal(context.activity.draws, 1);
		assert.deepEqual(context.activity.localReads, []);
	} finally {
		await context.close();
	}
});

for (const snapshot of _fixture.manifest.snapshots) {
	it(`renders pinned production resources and a captured catalogue: ${snapshot.id}`, async () => {
		const context = await createEngineFixtureRenderer({ fixture: _fixture, assetsDirectory: _assetsDirectory });
		try {
			await context.engine.start({ signal: AbortSignal.timeout(30_000) });
			const result = await context.service.render({ input: _fixture.getInput({ snapshot: snapshot }) });
			const repeated = await context.service.render({ input: _fixture.getInput({ snapshot: snapshot }) });
			assert.deepEqual(repeated.metadata, result.metadata);
			assert.equal(context.activity.draws, 3, "Repeated requests must perform an actual native draw.");
			assert.ok(context.activity.localReads.length >= 4);
			const decoded = await sharp(result.bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
			assert.equal(decoded.info.width, snapshot.input.size.width * 2);
			assert.equal(decoded.info.height, snapshot.input.size.height * 2);
			assert.equal(
				_hash(decoded.data),
				snapshot.expected.pixelSha256,
				"Pinned production pixels must remain unchanged.",
			);
			assert.equal(result.metadata.digest, _hash(result.bytes));
			assert.deepEqual(Buffer.from(repeated.bytes), Buffer.from(result.bytes));
			assert.equal(context.activity.diagnostics.length, 2);
			for (const metrics of context.activity.diagnostics) {
				assert.ok(metrics);
				assert.deepEqual(
					metrics.acceptedLabelIds.filter((id) => id.startsWith("landmark:")).map((id) => id.slice("landmark:".length)),
					snapshot.expected.visibleLandmarkIds,
				);
				assert.equal(metrics.missingGlyphs, 0);
				assert.equal(metrics.unsupportedLabels, 0);
				assert.equal(metrics.roiGeometry?.workers, 2);
				assert.equal(metrics.roiFallback, null);
			}
			await _save({ id: snapshot.id, bytes: result.bytes });
		} finally {
			await context.close();
		}
	});
}

it("renders caller-selected dimensions outside Maps presets with the packaged engine", async () => {
	const context = await createEngineFixtureRenderer({ fixture: _fixture, assetsDirectory: _assetsDirectory });
	try {
		await context.engine.start({ signal: AbortSignal.timeout(30_000) });
		const result = await context.service.render({ input: { ..._input(), size: { width: 400, height: 400 } } });
		const metadata = await sharp(result.bytes).metadata();
		assert.equal(metadata.format, "webp");
		assert.equal(metadata.width, 800);
		assert.equal(metadata.height, 800);
		assert.equal(result.metadata.pixelWidth, 800);
		assert.equal(result.metadata.pixelHeight, 800);
	} finally {
		await context.close();
	}
});

it("rejects corrupted fixture bytes at the source loader before constructing a renderer", async () => {
	const directory = await mkdtemp(join(tmpdir(), "mapshot-corrupt-fixture-"));
	try {
		await cp(_directory, directory, { recursive: true });
		const resource = _fixture.manifest.resources[0];
		assert.ok(resource);
		const path = join(directory, resource.file);
		const bytes = await readFile(path);
		bytes[0] = (bytes[0] ?? 0) ^ 1;
		await writeFile(path, bytes);
		await assert.rejects(loadEngineFixture({ directory: directory }), /Pinned integration fixture differs/u);
	} finally {
		await rm(directory, { recursive: true });
	}
});

it("rejects a missing source before encoding a delivery image", async () => {
	type ReadLocal = NonNullable<Parameters<typeof createEngineFixtureRenderer>[0]["readLocal"]>;
	const readLocal = td.func<ReadLocal>();
	td.when(readLocal(td.matchers.anything())).thenReject(new RenderingResourceUnavailableError());
	const context = await createEngineFixtureRenderer({
		fixture: _fixture,
		assetsDirectory: _assetsDirectory,
		readLocal: readLocal,
	});
	try {
		await context.engine.start({ signal: AbortSignal.timeout(30_000) });
		await assert.rejects(
			context.service.render({ input: _input() }),
			(error: unknown) => error instanceof AppError && error.errorCode === "RESOURCE_UNAVAILABLE",
		);
		assert.equal(context.activity.draws, 1, "Only the readiness image may have been encoded.");
	} finally {
		await context.close();
	}
});

it("fails readiness when the selected production font bundle is absent", async () => {
	const directory = await mkdtemp(join(tmpdir(), "mapshot-missing-fonts-"));
	const assetsService = Object.assign(td.object<EngineAssetsService>(), { fontRoot: join(directory, "fonts") });
	const engine = new RendererService(new RendererProcessRepository(assetsService), assetsService);
	try {
		await assert.rejects(
			engine.start({ signal: AbortSignal.timeout(30000) }),
			// Rust exits before protocol input; either process closure or the failed pipe write may arrive first.
			(error: unknown) =>
				error instanceof AppError &&
				(error.errorCode === AppErrorCode.RENDERER_PROCESS_CLOSED ||
					error.errorCode === AppErrorCode.RENDERER_INITIALIZATION_FAILED),
		);
	} finally {
		await engine.close();
		await rm(directory, { recursive: true });
	}
});
