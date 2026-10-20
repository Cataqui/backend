import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LandmarkIndexRepository } from "./landmark-index.repository";

const _resources: { directory: string; repository: LandmarkIndexRepository }[] = [];
afterEach(() => {
	for (const resource of _resources.splice(0)) {
		resource.repository.close();
		rmSync(resource.directory, { recursive: true, force: true });
	}
});

describe("LandmarkIndexRepository", () => {
	it("returns native file statistics and read counts without interpreting an archive", () => {
		const directory = mkdtempSync(join(tmpdir(), "mapshot-packed-file-"));
		const path = join(directory, "index");
		writeFileSync(path, Uint8Array.of(1, 2, 3));
		const repository = new LandmarkIndexRepository({ path: path });
		_resources.push({ directory: directory, repository: repository });
		const bytes = new Uint8Array(4);
		expect(repository.stat().size).toBe(3);
		expect(repository.read({ bytes: bytes, offset: 0, length: 4, position: 1 })).toBe(2);
		expect(bytes).toEqual(Uint8Array.of(2, 3, 0, 0));
	});
});
