import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as td from "testdouble";
import { createDeploymentCandidate } from "../../../test/basemap-deployment.fixture";
import { createPackedLandmarkIndexFixture } from "../../../test/landmark-index.fixture";
import type { R2ArchiveRangeService } from "../r2-archive-range.service";
import type { BasemapIndexExportRepository } from "./basemap-index-export.repository";
import { BasemapIndexExportService } from "./basemap-index-export.service";
import {
	BasemapIndexPreparationService,
	type BasemapIndexPreparationRepository,
} from "./basemap-index-preparation.service";

afterEach(() => td.reset());

vi.mock("./basemap-index-preparation.service", async (importOriginal) => {
	const td = await import("testdouble");
	const original = await importOriginal<typeof import("./basemap-index-preparation.service")>();
	return { BasemapIndexPreparationService: td.constructor(original.BasemapIndexPreparationService) };
});

const _source = createDeploymentCandidate();
const _index = {
	release: _source.release,
	reference: _source.prepared,
	landmarks: createPackedLandmarkIndexFixture({ archiveId: _source.release.pmtiles.digest.value }),
};

function _dependencies(): {
	archiveRangeService: R2ArchiveRangeService;
	repository: BasemapIndexExportRepository;
	preparation: BasemapIndexPreparationService;
	storage: () => BasemapIndexPreparationRepository;
} {
	const archiveRangeService = td.object<R2ArchiveRangeService>();
	const repository = td.object<BasemapIndexExportRepository>();
	const preparation = td.object<BasemapIndexPreparationService>();
	let storage: BasemapIndexPreparationRepository;
	td.when(repository.createDirectory({ prefix: "/work/indexes-" })).thenResolve("/work/indexes-test");
	td.when(repository.writeFile(td.matchers.anything())).thenResolve(undefined);
	td.when(repository.removeDirectory(td.matchers.anything())).thenResolve(undefined);
	td.when(new BasemapIndexPreparationService(td.matchers.anything())).thenDo(
		(input: ConstructorParameters<typeof BasemapIndexPreparationService>[0]): BasemapIndexPreparationService => {
			storage = input.repository;
			return preparation;
		},
	);
	return {
		archiveRangeService: archiveRangeService,
		repository: repository,
		preparation: preparation,
		storage: (): BasemapIndexPreparationRepository => storage,
	};
}

function _input(): Parameters<BasemapIndexExportService["export"]>[0] {
	return {
		release: _index.release,
		landmarks: _index.landmarks.reference,
		workDirectory: "/work",
		deadlineAt: Date.now() + 10_000,
	};
}

it("exports preparation writes in order with authenticated file descriptors and forwards range reads", async () => {
	const dependencies = _dependencies();
	const suppliedSignal = new AbortController().signal;
	const tileBytes = new Uint8Array([1, 2, 3]);
	const manifestBytes = new Uint8Array([4, 5]);
	td.when(dependencies.archiveRangeService.readRange(td.matchers.anything())).thenResolve(tileBytes);
	td.when(dependencies.preparation.prepare(td.matchers.anything())).thenDo(
		async (
			params: Parameters<BasemapIndexPreparationService["prepare"]>[0],
		): ReturnType<BasemapIndexPreparationService["prepare"]> => {
			const storage = dependencies.storage();
			await expect(
				storage.readRange({ archive: params.release.pmtiles, offset: 4, length: 3, signal: undefined }),
			).resolves.toBe(tileBytes);
			await storage.readRange({ archive: params.release.pmtiles, offset: 8, length: 3, signal: suppliedSignal });
			await storage.putObject({
				key: "index.body",
				bytes: tileBytes,
				contentType: "application/octet-stream",
				signal: undefined,
			});
			await storage.putObject({
				key: _index.reference.manifestKey,
				bytes: manifestBytes,
				contentType: "application/json",
				signal: suppliedSignal,
			});
			return _index.reference;
		},
	);
	const input = _input();
	const result = await new BasemapIndexExportService(dependencies).export(input);
	expect(result).toEqual({
		reference: _index.reference,
		files: [
			{
				key: "index.body",
				path: "/work/indexes-test/0.body",
				bytes: 3,
				sha256: createHash("sha256").update(tileBytes).digest("hex"),
				contentType: "application/octet-stream",
			},
			{
				key: _index.reference.manifestKey,
				path: "/work/indexes-test/1.body",
				bytes: 2,
				sha256: createHash("sha256").update(manifestBytes).digest("hex"),
				contentType: "application/json",
			},
		],
	});
	td.verify(
		dependencies.preparation.prepare({
			release: input.release,
			landmarks: input.landmarks,
			signal: td.matchers.isA(AbortSignal),
		}),
	);
	td.verify(
		dependencies.archiveRangeService.readRange({
			key: input.release.pmtiles.objectKey,
			etag: input.release.pmtiles.etag,
			offset: 4,
			length: 3,
			signal: td.matchers.isA(AbortSignal),
		}),
	);
	td.verify(
		dependencies.archiveRangeService.readRange({
			key: input.release.pmtiles.objectKey,
			etag: input.release.pmtiles.etag,
			offset: 8,
			length: 3,
			signal: suppliedSignal,
		}),
	);
	td.verify(
		dependencies.repository.writeFile({
			path: "/work/indexes-test/0.body",
			bytes: tileBytes,
			signal: td.matchers.isA(AbortSignal),
		}),
	);
	td.verify(
		dependencies.repository.writeFile({
			path: "/work/indexes-test/1.body",
			bytes: manifestBytes,
			signal: suppliedSignal,
		}),
	);
	td.verify(dependencies.repository.removeDirectory(td.matchers.anything()), { times: 0 });
});

it("removes the complete spool when preparation fails after a partial write", async () => {
	const dependencies = _dependencies();
	const failure = new Error("range failed");
	td.when(dependencies.preparation.prepare(td.matchers.anything())).thenDo(
		async (): ReturnType<BasemapIndexPreparationService["prepare"]> => {
			await dependencies.storage().putObject({
				key: "index.body",
				bytes: new Uint8Array([1]),
				contentType: "application/octet-stream",
				signal: undefined,
			});
			throw failure;
		},
	);
	await expect(new BasemapIndexExportService(dependencies).export(_input())).rejects.toBe(failure);
	td.verify(dependencies.repository.removeDirectory({ path: "/work/indexes-test" }));
});

it("removes the spool when exporting a prepared file fails", async () => {
	const dependencies = _dependencies();
	const failure = new Error("disk full");
	td.when(dependencies.repository.writeFile(td.matchers.anything())).thenReject(failure);
	td.when(dependencies.preparation.prepare(td.matchers.anything())).thenDo(
		async (): ReturnType<BasemapIndexPreparationService["prepare"]> => {
			await dependencies.storage().putObject({
				key: "index.body",
				bytes: new Uint8Array([1]),
				contentType: "application/octet-stream",
				signal: undefined,
			});
			return _index.reference;
		},
	);
	await expect(new BasemapIndexExportService(dependencies).export(_input())).rejects.toBe(failure);
	td.verify(dependencies.repository.removeDirectory({ path: "/work/indexes-test" }));
});

it("rejects an expired export before creating its spool", async () => {
	const dependencies = _dependencies();
	await expect(
		new BasemapIndexExportService(dependencies).export({ ..._input(), deadlineAt: 1 }),
	).rejects.toMatchObject({
		name: "TimeoutError",
	});
	td.verify(dependencies.repository.createDirectory(td.matchers.anything()), { times: 0 });
	td.verify(dependencies.preparation.prepare(td.matchers.anything()), { times: 0 });
});

it("constructs the preparation service and retains its completed spool by default", async () => {
	const directory = mkdtempSync(join(tmpdir(), "mapshot-index-export-test-"));
	try {
		const prepare = td.replace(BasemapIndexPreparationService.prototype, "prepare");
		td.when(prepare(td.matchers.anything())).thenResolve(_index.reference);
		await expect(
			new BasemapIndexExportService({ archiveRangeService: td.object<R2ArchiveRangeService>() }).export({
				..._input(),
				workDirectory: directory,
			}),
		).resolves.toEqual({ reference: _index.reference, files: [] });
		expect(readdirSync(directory)).toHaveLength(1);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});
