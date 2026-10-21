import { AppErrorCode } from "../../errors/index";
import * as td from "testdouble";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, symlink, writeFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BasemapIndexInstallationService } from "./basemap-index-installation.service";
import { BasemapIndexInstallationRepository } from "./basemap-index-installation.repository";

afterEach(() => td.reset());

const _roots: string[] = [];
afterEach(async () => {
	await Promise.all(_roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
	vi.restoreAllMocks();
});

async function _fixture(): Promise<{
	root: string;
	bytes: Uint8Array<ArrayBuffer>;
	file: { path: string; bytes: number; sha256: string };
	service: BasemapIndexInstallationService;
}> {
	const directory = await mkdtemp(join(tmpdir(), "mapshot-index-install-"));
	_roots.push(directory);
	const root = await realpath(directory);
	await mkdir(join(root, "files"));
	const bytes = Uint8Array.of(1, 2, 3);
	const sha256 = createHash("sha256").update(bytes).digest("hex");
	const path = `files/${sha256}.body`;
	await writeFile(join(root, path), bytes);
	return {
		root: root,
		bytes: bytes,
		file: { path: path, bytes: bytes.length, sha256: sha256 },
		service: new BasemapIndexInstallationService({ repository: new BasemapIndexInstallationRepository(root) }),
	};
}

describe("installed basemap file boundary", () => {
	it("reads verified installed files larger than the former eight mebibyte limit", async () => {
		const fixture = await _fixture();
		const bytes = new Uint8Array(8 * 1024 * 1024 + 1).fill(42);
		const sha256 = createHash("sha256").update(bytes).digest("hex");
		const path = `files/${sha256}.body`;
		await writeFile(join(fixture.root, path), bytes);
		expect(
			Buffer.from(
				await fixture.service.readVerified({ file: { path: path, sha256: sha256, bytes: bytes.length } }),
			).equals(bytes),
		).toBe(true);
	});

	it("reads and verifies content addressed files and exact bounded slices", async () => {
		const fixture = await _fixture();
		expect(await fixture.service.getFileSize({ path: fixture.file.path, expectedBytes: 3 })).toBe(3);
		expect(await fixture.service.readVerified({ file: fixture.file })).toEqual(fixture.bytes);
		expect(await fixture.service.read({ path: fixture.file.path, offset: 1, length: 2 })).toEqual(Uint8Array.of(2, 3));
		expect(await fixture.service.read({ path: fixture.file.path, offset: 3, length: 0 })).toEqual(new Uint8Array(0));
	});

	it.each(["../outside", ".", "files"])("refuses non-file or escaping path %s", async (path) => {
		const fixture = await _fixture();
		await expect(fixture.service.getFileSize({ path: path })).rejects.toMatchObject({
			errorCode: AppErrorCode.BASEMAP_INDEX_INTEGRITY,
		});
	});

	it("refuses files whose size differs from their declared content", async () => {
		const fixture = await _fixture();
		await expect(fixture.service.getFileSize({ path: fixture.file.path, expectedBytes: 2 })).rejects.toMatchObject({
			errorCode: AppErrorCode.BASEMAP_INDEX_INTEGRITY,
		});
	});

	it("refuses symbolic links for installed files and parent directories", async () => {
		const fixture = await _fixture();
		await symlink(join(fixture.root, fixture.file.path), join(fixture.root, "link"));
		await symlink(join(fixture.root, "files"), join(fixture.root, "linked-files"));
		await expect(fixture.service.read({ path: "link" })).rejects.toMatchObject({
			errorCode: AppErrorCode.BASEMAP_INDEX_INTEGRITY,
		});
		await expect(fixture.service.read({ path: `linked-files/${fixture.file.sha256}.body` })).rejects.toMatchObject({
			errorCode: AppErrorCode.BASEMAP_INDEX_INTEGRITY,
		});
	});

	it("rejects a non-directory parent before opening an installed file", async () => {
		const fixture = await _fixture();
		await expect(fixture.service.read({ path: `${fixture.file.path}/child` })).rejects.toMatchObject({
			errorCode: AppErrorCode.BASEMAP_INDEX_INTEGRITY,
		});
	});

	it.each([
		{ offset: -1 },
		{ offset: 0.5 },
		{ offset: Number.NaN },
		{ length: -1 },
		{ length: 1.5 },
		{ length: Number.POSITIVE_INFINITY },
		{ offset: 2, length: 2 },
	])("refuses invalid file range %o", async (range) => {
		const fixture = await _fixture();
		await expect(fixture.service.read({ path: fixture.file.path, ...range })).rejects.toMatchObject({
			errorCode: AppErrorCode.BASEMAP_INDEX_INTEGRITY,
		});
	});

	it("rejects corrupt file content even when its exact size matches", async () => {
		const fixture = await _fixture();
		await writeFile(join(fixture.root, fixture.file.path), Uint8Array.of(1, 2, 4));
		await expect(fixture.service.readVerified({ file: fixture.file })).rejects.toMatchObject({
			errorCode: AppErrorCode.BASEMAP_INDEX_INTEGRITY,
		});
	});

	it("aborts a verified read before touching the installed filesystem", async () => {
		const fixture = await _fixture();
		const stat = vi.spyOn(fixture.service, "getFileSize");
		await expect(
			fixture.service.readVerified({ file: fixture.file, signal: AbortSignal.abort() }),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(stat).not.toHaveBeenCalled();
	});

	it("reads immutable bundled ranges without repeating startup file validation", async () => {
		const fixture = await _fixture();
		await fixture.service.getFileSize({ path: fixture.file.path, expectedBytes: fixture.file.bytes });
		const stat = vi.spyOn(fixture.service, "getFileSize");
		expect(
			await fixture.service.read({ path: fixture.file.path, expectedBytes: fixture.file.bytes, offset: 1, length: 2 }),
		).toEqual(Uint8Array.of(2, 3));
		expect(stat).not.toHaveBeenCalled();
	});

	it("rejects an incomplete read of a bundled range", async () => {
		const root = (await _fixture()).root;
		const repository = new BasemapIndexInstallationRepository(root);
		td.when(td.replace(repository, "read")(td.matchers.anything())).thenResolve(Uint8Array.of(1));
		const service = new BasemapIndexInstallationService({ repository: repository });
		await expect(service.read({ path: "files/index.body", expectedBytes: 3 })).rejects.toMatchObject({
			errorCode: AppErrorCode.BASEMAP_INDEX_INTEGRITY,
		});
	});

	it("discards a bundled read completed after cancellation", async () => {
		const fixture = await _fixture();
		const repository = new BasemapIndexInstallationRepository(fixture.root);
		const controller = new AbortController();
		td.when(td.replace(repository, "read")(td.matchers.anything())).thenDo(
			async (): ReturnType<BasemapIndexInstallationRepository["read"]> => {
				controller.abort();
				return fixture.bytes;
			},
		);
		const service = new BasemapIndexInstallationService({ repository: repository });
		await expect(
			service.read({ path: fixture.file.path, expectedBytes: fixture.file.bytes, signal: controller.signal }),
		).rejects.toMatchObject({ name: "AbortError" });
	});

	it("honors cancellation admitted during initial file validation", async () => {
		const fixture = await _fixture();
		const controller = new AbortController();
		const stat = fixture.service.getFileSize.bind(fixture.service);
		td.when(td.replace(fixture.service, "getFileSize")(td.matchers.anything())).thenDo(
			async (
				params: Parameters<BasemapIndexInstallationService["getFileSize"]>[0],
			): ReturnType<BasemapIndexInstallationService["getFileSize"]> => {
				const size = await stat(params);
				controller.abort();
				return size;
			},
		);
		await expect(fixture.service.read({ path: fixture.file.path, signal: controller.signal })).rejects.toMatchObject({
			name: "AbortError",
		});
	});
});
