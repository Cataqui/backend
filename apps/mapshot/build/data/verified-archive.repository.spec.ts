import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { VerifiedArchiveRepository } from "./verified-archive.repository";

it("moves the completed landmark archive and preserves missing-file errors", async () => {
	const directory = await mkdtemp(join(tmpdir(), "mapshot-verified-archive-"));
	const from = join(directory, "packed.pmtiles");
	const to = join(directory, "landmarks.pmtiles");
	const repository = new VerifiedArchiveRepository();
	try {
		await writeFile(from, new Uint8Array([1, 2, 3]));
		await repository.moveLandmarks({ from: from, to: to });
		expect(await readFile(to)).toEqual(Buffer.from([1, 2, 3]));
		await expect(repository.moveLandmarks({ from: from, to: to })).rejects.toMatchObject({ code: "ENOENT" });
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
