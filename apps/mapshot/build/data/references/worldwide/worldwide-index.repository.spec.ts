import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { WorldwideIndexRepository } from "./worldwide-index.repository";

const _directories: string[] = [];

afterEach(() => {
	for (const directory of _directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function _directory(): string {
	const directory = mkdtempSync(join(tmpdir(), "mapshot-worldwide-index-io-test-"));
	_directories.push(directory);
	return directory;
}

it("executes scratch database operations and returns raw SQLite results", () => {
	const repository = new WorldwideIndexRepository();
	const database = repository.openDatabase(join(_directory(), "scratch.sqlite"));
	try {
		database.exec("CREATE TABLE points(id INTEGER PRIMARY KEY,name TEXT NOT NULL)");
		const insert = database.prepare("INSERT INTO points(id,name) VALUES(?,?)");
		expect(insert.run(1, "Praça")).toMatchObject({ changes: 1, lastInsertRowid: 1 });
		const query = database.prepare("SELECT id,name FROM points WHERE id=?");
		expect(query.get(1)).toEqual({ id: 1, name: "Praça" });
		expect(query.get(2)).toBeUndefined();
		expect([...query.iterate(1)]).toEqual([{ id: 1, name: "Praça" }]);
		expect(() => insert.run(1, "duplicate")).toThrow("UNIQUE constraint failed");
	} finally {
		database.close();
	}
});

it("exposes raw filesystem results and failures without application interpretation", async () => {
	const repository = new WorldwideIndexRepository();
	const directory = join(_directory(), "generation");
	repository.mkdir(directory);
	const path = join(directory, "payload.bin");
	expect(repository.exists(path)).toBe(false);
	const descriptor = repository.open(path, "wx");
	try {
		expect(repository.write(descriptor, Uint8Array.of(1, 2, 3), 0, 3)).toBe(3);
	} finally {
		repository.close(descriptor);
	}
	expect(repository.stat(path).size).toBe(3);
	const input = repository.open(path, "r");
	try {
		const bytes = new Uint8Array(4);
		expect(repository.read(input, bytes, 0, 4, 0)).toBe(3);
		expect(bytes).toEqual(Uint8Array.of(1, 2, 3, 0));
	} finally {
		repository.close(input);
	}
	const streamed: Buffer[] = [];
	for await (const bytes of repository.readStream(path)) streamed.push(Buffer.from(bytes));
	expect(Buffer.concat(streamed)).toEqual(Buffer.from([1, 2, 3]));
	const published = join(directory, "published.bin");
	repository.rename(path, published);
	expect(repository.exists(published)).toBe(true);
	expect(() => repository.stat(path)).toThrow(expect.objectContaining({ code: "ENOENT" }));
});
