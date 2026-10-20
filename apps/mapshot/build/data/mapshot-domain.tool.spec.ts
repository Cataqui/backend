import { BasemapIndexIntegrityError } from "../../src/tiles/sources/indexes/basemap-index-integrity.error";
import { ReferenceImportErrorCode } from "./references/reference-import-error-code.enum";
import { SourceImportErrorCode } from "./source-import-error-code.enum";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as td from "testdouble";
import { createDeploymentCandidate } from "../../test/basemap-deployment.fixture";
import { createIndexFixture } from "../../test/basemap-index.fixture";
import { getBasemapIndexFiles } from "../../src/tiles/sources/indexes/basemap-index-manifest";
import {
	SourceImportCheckpointSchema,
	type SourceImportCheckpoint,
} from "./contracts/import/source-import-checkpoint.schema";
import { SourceImportJobSchema } from "./contracts/import/source-import-job.schema";
import type { BasemapPromotionAsset } from "./contracts/promotion/basemap-promotion-asset.schema";
import type { BasemapPromotionDescriptor } from "./contracts/promotion/basemap-promotion-descriptor.schema";
import type { BasemapPromotionManifestReference } from "./contracts/promotion/basemap-promotion-manifest-reference.schema";
import type { MapshotDeployment } from "./contracts/release/mapshot-deployment.schema";
import { evaluateMapshotDomainRequest, runMapshotDomainCli } from "./mapshot-domain.tool";
import { BasemapIndexExportService } from "./indexes/basemap-index-export.service";
import { ReferenceImportError } from "./references/reference-import.error";
import { SourceImportError } from "./source-import.error";
import { VerifyArchiveService } from "./verify-archive.service";

afterEach(() => td.reset());

const _source = createDeploymentCandidate();
const _operation = "f".repeat(64);
const _job = SourceImportJobSchema.parse({
	id: _operation,
	archive: {
		key: "20261016.pmtiles",
		bytes: _source.release.pmtiles.bytes,
		blake3: _source.release.pmtiles.digest.value,
		version: "4.15.2",
		observedAt: 100,
	},
	objectKey: "source/slots/a/planet.pmtiles",
});
const _credentials = {
	CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
	MAPSHOT_R2_ACCESS_KEY_ID: "private-access-key",
	MAPSHOT_R2_SECRET_ACCESS_KEY: "private-secret-key",
};
const _directories: string[] = [];
let _index: Awaited<ReturnType<typeof createIndexFixture>>;

beforeAll(async () => {
	_index = await createIndexFixture();
});

beforeEach(() => {
	td.replace(console, "error", td.func<typeof console.error>());
});

afterEach(() => {
	for (const directory of _directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function _directory(): string {
	const directory = mkdtempSync(join(tmpdir(), "mapshot-domain-tool-test-"));
	_directories.push(directory);
	return directory;
}

function _checkpoint(params: { retained?: boolean; objectEtag?: string | null } = {}): SourceImportCheckpoint {
	return SourceImportCheckpointSchema.parse({
		schemaVersion: 1,
		id: _job.id,
		input: _job,
		generation: 0,
		stage: "verifying",
		updatedAt: 100,
		objectKey: _job.objectKey,
		uploadId: null,
		sourceEtag: null,
		objectEtag: params.objectEtag === undefined ? _source.release.pmtiles.etag : params.objectEtag,
		verifiedArchive: params.retained === true ? { ..._source.release.pmtiles, objectKey: _job.objectKey } : null,
		packedIndex: null,
		parts: [],
		status: { kind: "running", id: _job.id, phase: "verifying", updatedAt: 100 },
	});
}

const _asset = {
	key: "source/slots/a/planet.pmtiles",
	bytes: 1000,
	etag: "stored-etag",
	contentType: "application/octet-stream",
} satisfies BasemapPromotionAsset;
const _descriptor = {
	key: `source/promotions/v1/${_operation}/pages/${"a".repeat(64)}.json`,
	bytes: 100,
	sha256: "a".repeat(64),
} satisfies BasemapPromotionDescriptor;
const _inventory = {
	key: `source/promotions/v1/${_operation}/assets.json`,
	sha256: "a".repeat(64),
	bytes: 100,
} satisfies BasemapPromotionManifestReference;
const _deployment = {
	slot: "a",
	fingerprint: "b".repeat(64),
	source: _source,
	codeRevision: "1".repeat(40),
	image: `registry.cloudflare.com/test/mapshot@sha256:${"a".repeat(64)}`,
	artifact: { key: "deployments/worker.tar", sha256: "a".repeat(64) },
} satisfies MapshotDeployment;
const _contracts: { kind: string; value: () => unknown }[] = [
	{ kind: "deployment-state", value: () => ({ version: 1, active: _deployment, previous: null, pending: null }) },
	{ kind: "deployment", value: () => _deployment },
	{ kind: "preparation", value: () => ({ operation: _operation, input: _job, source: _source }) },
	{ kind: "promotion", value: () => ({ operation: _operation, source: _source, inventory: _inventory }) },
	{
		kind: "copy-checkpoint",
		value: () => ({ operation: _operation, page: 0, asset: 0, archiveEtag: null, transfer: null }),
	},
	{ kind: "source", value: () => _source },
	{ kind: "source-release", value: () => _source.release },
	{
		kind: "promotion-manifest",
		value: () => ({
			version: 1,
			pages: [_descriptor],
		}),
	},
	{ kind: "promotion-page", value: () => ({ version: 1, assets: [_asset] }) },
	{ kind: "promotion-asset", value: () => _asset },
	{ kind: "promotion-descriptor", value: () => _descriptor },
	{ kind: "promotion-reference", value: () => _inventory },
	{ kind: "index-manifest", value: () => _index.manifest },
	{
		kind: "protomaps-builds",
		value: () => [
			{
				key: "20261016.pmtiles",
				size: 1000,
				uploaded: "2026-10-16T00:00:00.000Z",
				version: "4.15.2",
				b3sum: "a".repeat(64),
			},
		],
	},
	{ kind: "protomaps-archive", value: () => _job.archive },
	{ kind: "release-input", value: () => ({ operation: "state.read", environment: "staging" }) },
	{ kind: "import-job", value: () => _job },
	{ kind: "import-checkpoint", value: () => _checkpoint() },
	{ kind: "import-phase", value: () => "verify" },
];

it.each(_contracts)("validates the authoritative $kind contract", async ({ kind, value }) => {
	const expected = value();
	await expect(
		evaluateMapshotDomainRequest({ input: { operation: "validate", kind: kind, value: expected }, environment: {} }),
	).resolves.toEqual(expected);
});

it.each(_contracts)("rejects invalid data at the $kind boundary", async ({ kind }) => {
	await expect(
		evaluateMapshotDomainRequest({ input: { operation: "validate", kind: kind, value: null }, environment: {} }),
	).rejects.toThrow();
});

it("rejects malformed state writes at the release input boundary", async () => {
	await expect(
		evaluateMapshotDomainRequest({
			input: {
				operation: "validate",
				kind: "release-input",
				value: { operation: "state.write", environment: "staging", etag: null, value: { version: 1 } },
			},
			environment: {},
		}),
	).rejects.toThrow();
});

it("rejects unknown contract names without resolving inherited object properties", async () => {
	await expect(
		evaluateMapshotDomainRequest({ input: { operation: "validate", kind: "toString", value: {} }, environment: {} }),
	).rejects.toMatchObject({ code: SourceImportErrorCode.INVALID_INPUT });
});

it("returns the promotion page asset limit", async () => {
	await expect(
		evaluateMapshotDomainRequest({ input: { operation: "promotion.pageAssetLimit" }, environment: {} }),
	).resolves.toBe(100);
});

it.each([
	{ operation: "reservation.fingerprint", source: _source },
	{ operation: "import.fingerprint", input: _job },
])("rejects the Ruby-owned $operation operation at the Node boundary", async (input) => {
	await expect(evaluateMapshotDomainRequest({ input: input, environment: {} })).rejects.toThrow();
});

it("returns the validated manifest and its index files together", async () => {
	await expect(
		evaluateMapshotDomainRequest({ input: { operation: "index.files", manifest: _index.manifest }, environment: {} }),
	).resolves.toEqual({ manifest: _index.manifest, files: getBasemapIndexFiles({ manifest: _index.manifest }) });
});

it.each(["archiveId", "sha256", "key"] as const)(
	"rejects a mismatched landmark %s at the index preparation input boundary",
	async (field) => {
		const exportIndexes = td.replace(BasemapIndexExportService.prototype, "export");
		await expect(
			evaluateMapshotDomainRequest({
				input: {
					operation: "indexes.prepare",
					environment: "staging",
					workDirectory: "/work",
					deadlineAt: Date.now() + 10_000,
					release: _index.release,
					landmarks: {
						..._index.landmarks.reference,
						[field]: field === "key" ? "another/index.pmtiles" : "f".repeat(64),
					},
				},
				environment: _credentials,
			}),
		).rejects.toThrow();
		td.verify(exportIndexes(td.matchers.anything()), { times: 0 });
	},
);

it("delegates index exporting with the validated release, work directory and deadline", async () => {
	const directory = _directory();
	const deadlineAt = Date.now() + 10_000;
	const expected: Awaited<ReturnType<BasemapIndexExportService["export"]>> = {
		reference: _index.reference,
		files: [
			{
				key: "index.body",
				path: join(directory, "0.body"),
				bytes: 3,
				sha256: "a".repeat(64),
				contentType: "application/octet-stream",
			},
		],
	};
	const exportIndexes = td.replace(BasemapIndexExportService.prototype, "export");
	td.when(exportIndexes(td.matchers.anything())).thenResolve(expected);
	await expect(
		evaluateMapshotDomainRequest({
			input: {
				operation: "indexes.prepare",
				environment: "production",
				workDirectory: directory,
				deadlineAt: deadlineAt,
				release: _index.release,
				landmarks: _index.landmarks.reference,
			},
			environment: _credentials,
		}),
	).resolves.toEqual(expected);
	td.verify(
		exportIndexes({
			release: _index.release,
			landmarks: _index.landmarks.reference,
			workDirectory: directory,
			deadlineAt: deadlineAt,
		}),
	);
});

it.each([false, true])("delegates verification and landmark extraction with existing metadata %s", async (retained) => {
	const checkpoint = _checkpoint({ retained: retained });
	const directory = _directory();
	const expected: Awaited<ReturnType<VerifyArchiveService["verifyAndExtractLandmarks"]>> = {
		archive: _source.release.pmtiles,
		landmarks: {
			path: join(directory, "landmarks.pmtiles"),
			sha256: "a".repeat(64),
			bytes: 1000,
			archiveId: _job.archive.blake3,
		},
	};
	const verifyAndExtractLandmarks = td.replace(VerifyArchiveService.prototype, "verifyAndExtractLandmarks");
	td.when(verifyAndExtractLandmarks(td.matchers.anything())).thenResolve(expected);
	await expect(
		evaluateMapshotDomainRequest({
			input: {
				operation: "archive.verify",
				environment: "staging",
				workDirectory: directory,
				deadlineAt: Date.now() + 10_000,
				checkpoint: checkpoint,
			},
			environment: _credentials,
		}),
	).resolves.toEqual(expected);
	expect(td.explain(verifyAndExtractLandmarks).calls.map((call) => call.args)).toEqual([
		[
			{
				checkpoint: checkpoint,
				workDirectory: directory,
				deadlineAt: expect.any(Number),
			},
		],
	]);
});

async function* _chunks(params: { chunks: (string | Buffer)[] }): AsyncGenerator<string | Buffer, void, unknown> {
	for (const chunk of params.chunks) yield chunk;
}

async function _cli(
	params: { input?: unknown; chunks?: (string | Buffer)[]; args?: string[]; environment?: NodeJS.ProcessEnv } = {},
): Promise<{ status: number; output: string }> {
	const output = join(_directory(), "result.json");
	const status = await runMapshotDomainCli({
		args: params.args ?? ["--output", output],
		stdin: _chunks({
			chunks: params.chunks ?? [JSON.stringify(params.input ?? { operation: "promotion.pageAssetLimit" })],
		}),
		environment: params.environment ?? {},
	});
	return { status: status, output: output };
}

it("writes one private JSON response after reading mixed stdin chunks", async () => {
	const result = await _cli({ chunks: [Buffer.from('{"operation":'), '"promotion.pageAssetLimit"}'] });
	expect(result.status).toBe(0);
	expect(JSON.parse(readFileSync(result.output, "utf8"))).toBe(100);
	expect(statSync(result.output).mode & 0o777).toBe(0o600);
	expect(td.explain(console.error).callCount).toBe(0);
});

it("preserves checkpoint integrity failures before reading storage", async () => {
	const result = await _cli({
		input: {
			operation: "archive.verify",
			environment: "staging",
			workDirectory: _directory(),
			deadlineAt: Date.now() + 10_000,
			checkpoint: _checkpoint({ objectEtag: null }),
		},
		environment: _credentials,
	});
	expect(result.status).toBe(1);
	expect(JSON.parse(readFileSync(result.output, "utf8"))).toEqual({
		error: { code: SourceImportErrorCode.INTEGRITY, retryable: false },
	});
});

it("returns a schema-normalized import job for Ruby numeric inputs", async () => {
	const input = JSON.stringify({ operation: "validate", kind: "import-job", value: _job })
		.replace('"bytes":1000', '"bytes":1e3')
		.replace('"observedAt":100', '"observedAt":100.0');
	const result = await _cli({ chunks: [input] });
	expect(result.status).toBe(0);
	expect(JSON.parse(readFileSync(result.output, "utf8"))).toEqual(_job);
});

it.each(["{", '{"operation":"unsupported"}', '{"operation":"validate","kind":"source","value":null}'])(
	"returns sanitized invalid-input failures for malformed requests: %s",
	async (text) => {
		const result = await _cli({ chunks: [text] });
		expect(result.status).toBe(1);
		expect(JSON.parse(readFileSync(result.output, "utf8"))).toEqual({
			error: { code: SourceImportErrorCode.INVALID_INPUT, retryable: false },
		});
	},
);

it("returns invalid-input for a release storage range with an unsafe end", async () => {
	const result = await _cli({
		input: {
			operation: "validate",
			kind: "release-input",
			value: {
				operation: "storage.readRange",
				environment: "staging",
				key: "artifact",
				offset: Number.MAX_SAFE_INTEGER,
				length: 1,
				etag: "stored-etag",
				path: "/tmp/archive-range.body",
			},
		},
	});
	expect(result.status).toBe(1);
	expect(JSON.parse(readFileSync(result.output, "utf8"))).toEqual({
		error: { code: SourceImportErrorCode.INVALID_INPUT, retryable: false },
	});
});

it.each([
	{ scenario: "missing output", args: [] },
	{ scenario: "relative output", args: ["--output", "relative.json"] },
	{ scenario: "unsupported flag", args: ["--unknown"] },
])("rejects invalid output arguments: $scenario", async ({ args }) => {
	const result = await _cli({ args: args });
	expect(result.status).toBe(1);
	expect(readdirSync(join(result.output, ".."))).toEqual([]);
});

it("refuses to overwrite an existing response file", async () => {
	const output = join(_directory(), "existing.json");
	writeFileSync(output, "caller-owned-content");
	const result = await _cli({ args: ["--output", output] });
	expect(result.status).toBe(1);
	expect(readFileSync(output, "utf8")).toBe("caller-owned-content");
});

const _sourceFailures = Object.values(SourceImportErrorCode);
const _failures = [
	..._sourceFailures.map((code) => ({
		name: `source ${code}`,
		error: new SourceImportError({ code: code }),
		code: code,
		retryable: [
			SourceImportErrorCode.ABORTED,
			SourceImportErrorCode.STORAGE,
			SourceImportErrorCode.CONFLICT,
			SourceImportErrorCode.SOURCE,
			SourceImportErrorCode.PREPARATION,
		].some((value) => value === code),
	})),
	{
		name: "index integrity",
		error: new BasemapIndexIntegrityError(),
		code: SourceImportErrorCode.INTEGRITY,
		retryable: false,
	},
	{
		name: "reference invalid-archive",
		error: new ReferenceImportError({ code: ReferenceImportErrorCode.INVALID_ARCHIVE }),
		code: SourceImportErrorCode.INTEGRITY,
		retryable: false,
	},
	{
		name: "reference integrity",
		error: new ReferenceImportError({ code: ReferenceImportErrorCode.INTEGRITY }),
		code: SourceImportErrorCode.INTEGRITY,
		retryable: false,
	},
	{
		name: "reference incomplete",
		error: new ReferenceImportError({ code: ReferenceImportErrorCode.INCOMPLETE }),
		code: SourceImportErrorCode.INVALID_INPUT,
		retryable: false,
	},
	{
		name: "reference capacity",
		error: new ReferenceImportError({ code: ReferenceImportErrorCode.CAPACITY }),
		code: SourceImportErrorCode.ATTEMPTS_EXHAUSTED,
		retryable: false,
	},
	{
		name: "storage capacity",
		error: Object.assign(new Error("private-disk-path"), { code: "ENOSPC" }),
		code: SourceImportErrorCode.ATTEMPTS_EXHAUSTED,
		retryable: false,
	},
	{
		name: "reference staging-conflict",
		error: new ReferenceImportError({ code: ReferenceImportErrorCode.STAGING_CONFLICT }),
		code: SourceImportErrorCode.PREPARATION,
		retryable: true,
	},
	{
		name: "closed reference extraction",
		error: new ReferenceImportError({ code: ReferenceImportErrorCode.CLOSED }),
		code: SourceImportErrorCode.PREPARATION,
		retryable: true,
	},
	{
		name: "reference worker exit",
		error: new ReferenceImportError({ code: ReferenceImportErrorCode.WORKER_EXITED }),
		code: SourceImportErrorCode.PREPARATION,
		retryable: true,
	},
	{
		name: "aborted native read",
		error: new DOMException("private-provider-response", "AbortError"),
		code: SourceImportErrorCode.ABORTED,
		retryable: true,
	},
	{
		name: "expired native read",
		error: new DOMException("private-provider-response", "TimeoutError"),
		code: SourceImportErrorCode.ABORTED,
		retryable: true,
	},
	{
		name: "unexpected provider error",
		error: new Error("private-provider-response"),
		code: SourceImportErrorCode.PREPARATION,
		retryable: true,
	},
	{
		name: "non-Error provider rejection",
		error: "private-provider-response",
		code: SourceImportErrorCode.PREPARATION,
		retryable: true,
	},
];

it.each(_failures)(
	"preserves structured $name failures without leaking provider details",
	async ({ error, code, retryable }) => {
		const exportIndexes = td.replace(BasemapIndexExportService.prototype, "export");
		td.when(exportIndexes(td.matchers.anything())).thenReject(error);
		const directory = _directory();
		const result = await _cli({
			input: {
				operation: "indexes.prepare",
				environment: "staging",
				workDirectory: directory,
				deadlineAt: Date.now() + 10_000,
				release: _index.release,
				landmarks: _index.landmarks.reference,
			},
			environment: _credentials,
		});
		expect(result.status).toBe(1);
		expect(JSON.parse(readFileSync(result.output, "utf8"))).toEqual({ error: { code: code, retryable: retryable } });
		expect(JSON.stringify(td.explain(console.error).calls.map((call) => call.args))).not.toContain(
			"private-provider-response",
		);
		expect(JSON.stringify(td.explain(console.error).calls.map((call) => call.args))).not.toContain(
			"private-secret-key",
		);
		expect(readdirSync(directory)).toEqual([]);
	},
);

it("validates credentials before constructing a provider read", async () => {
	const result = await _cli({
		input: {
			operation: "indexes.prepare",
			environment: "staging",
			workDirectory: _directory(),
			deadlineAt: Date.now() + 10_000,
			release: _index.release,
			landmarks: _index.landmarks.reference,
		},
	});
	expect(result.status).toBe(1);
	expect(JSON.parse(readFileSync(result.output, "utf8"))).toEqual({
		error: { code: SourceImportErrorCode.INVALID_INPUT, retryable: false },
	});
});
