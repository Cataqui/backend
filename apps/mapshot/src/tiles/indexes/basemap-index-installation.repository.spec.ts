import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BasemapIndexInstallationRepository } from "./basemap-index-installation.repository";

const _roots: string[] = [];
afterEach(async () => {
	await Promise.all(_roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function _fixture(): Promise<BasemapIndexInstallationRepository> {
	const root = await mkdtemp(join(tmpdir(), "mapshot-index-files-"));
	_roots.push(root);
	await writeFile(join(root, "file"), Uint8Array.of(1, 2, 3));
	return new BasemapIndexInstallationRepository(root);
}

describe("BasemapIndexInstallationRepository", () => {
	it("returns raw filesystem metadata and the requested byte range", async () => {
		const repository = await _fixture();
		expect((await repository.stat({ path: "file" })).size).toBe(3);
		expect(await repository.realpath({ path: "file" })).toMatch(/\/file$/u);
		const result = await repository.read({ path: "file", offset: 1, length: 2 });
		expect(result).toEqual(Uint8Array.of(2, 3));
	});

	it("leaves a short filesystem read for the service to interpret", async () => {
		const repository = await _fixture();
		const result = await repository.read({ path: "file", offset: 1, length: 4 });
		expect(result).toEqual(Uint8Array.of(2, 3));
	});

	it("preserves native missing-file failures", async () => {
		const repository = await _fixture();
		await expect(repository.stat({ path: "missing" })).rejects.toMatchObject({ code: "ENOENT" });
		await expect(repository.read({ path: "missing", offset: 0, length: 1 })).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("closes the file when cancellation interrupts its read", async () => {
		const repository = await _fixture();
		await expect(
			repository.read({ path: "file", offset: 0, length: 1, signal: AbortSignal.abort() }),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(await repository.read({ path: "file", offset: 0, length: 3 })).toEqual(Uint8Array.of(1, 2, 3));
	});
});
