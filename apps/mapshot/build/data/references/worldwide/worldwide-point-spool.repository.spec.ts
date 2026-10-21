import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { WorldwidePointSpoolRepository } from "./worldwide-point-spool.repository";

const _directories: string[] = [];
afterEach(() => {
	for (const directory of _directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

it("writes the requested remaining bytes and preserves exclusive-file failures", () => {
	const directory = mkdtempSync(join(tmpdir(), "mapshot-point-spool-"));
	_directories.push(directory);
	const path = join(directory, "points.ndjson");
	const repository = new WorldwidePointSpoolRepository();
	const descriptor = repository.open({ path: path });
	try {
		expect(repository.write({ descriptor: descriptor, bytes: Buffer.from("unused-data"), offset: 7 })).toBe(4);
	} finally {
		repository.close({ descriptor: descriptor });
	}
	expect(readFileSync(path, "utf8")).toBe("data");
	expect(() => repository.open({ path: path })).toThrow(expect.objectContaining({ code: "EEXIST" }));
});
