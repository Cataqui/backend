import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BasemapIndexExportRepository } from "./basemap-index-export.repository";

it("creates a private spool, writes each file exclusively, and removes the spool", async () => {
	const workDirectory = mkdtempSync(join(tmpdir(), "mapshot-index-export-repository-test-"));
	try {
		const repository = new BasemapIndexExportRepository();
		const directory = await repository.createDirectory({ prefix: join(workDirectory, "indexes-") });
		const path = join(directory, "0.body");
		const input = { path: path, bytes: new Uint8Array([1, 2, 3]), signal: new AbortController().signal };
		await repository.writeFile(input);
		expect(readFileSync(path)).toEqual(Buffer.from(input.bytes));
		expect(statSync(path).mode & 0o777).toBe(0o600);
		await expect(repository.writeFile(input)).rejects.toMatchObject({ code: "EEXIST" });
		await repository.removeDirectory({ path: directory });
		expect(readdirSync(workDirectory)).toEqual([]);
	} finally {
		rmSync(workDirectory, { recursive: true, force: true });
	}
});
