import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { WorldwideExtractionRepository } from "./worldwide-extraction.repository";

const _directories: string[] = [];

afterEach(() => {
	for (const directory of _directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

it("reads and removes only its extraction files", () => {
	const directory = mkdtempSync(join(tmpdir(), "mapshot-extraction-io-"));
	_directories.push(directory);
	const repository = new WorldwideExtractionRepository();
	const attempt = repository.createAttempt({ workDirectory: join(directory, "work") });
	const path = join(attempt, "members.bin");
	writeFileSync(path, new Uint8Array([1, 2, 3]));
	const fd = repository.openMembers({ path: path });
	const bytes = Buffer.alloc(3);
	try {
		expect(repository.readMembers({ fd: fd, bytes: bytes })).toBe(3);
		expect(bytes).toEqual(Buffer.from([1, 2, 3]));
	} finally {
		repository.closeMembers({ fd: fd });
	}
	expect(readFileSync(path)).toEqual(bytes);
	repository.removeFile({ path: path });
	expect(readdirSync(attempt)).toEqual([]);
	repository.removeAttempt({ directory: attempt });
	expect(readdirSync(join(directory, "work"))).toEqual([]);
});

it("preserves filesystem failures for its calling service", () => {
	const repository = new WorldwideExtractionRepository();
	expect(() => repository.openMembers({ path: "/missing-mapshot-extraction/members.bin" })).toThrow(
		expect.objectContaining({ code: "ENOENT" }),
	);
});
