import { BasemapSourceCandidateSchema } from "../../src/tiles/sources/schemas/basemap-source-candidate.schema";
import { SourceImportJobSchema } from "../../build/data/contracts/import/source-import-job.schema";
import { createIndexFixture } from "../basemap-index.fixture";

// Ruby contract tests consume actual prepared PMTiles bytes and normalized source contracts.
const fixture = await createIndexFixture();
const source = BasemapSourceCandidateSchema.parse({ release: fixture.release, prepared: fixture.reference });
const objects = new Map(fixture.objects);
objects.set(source.release.pmtiles.objectKey, fixture.bytes);
const importJob = SourceImportJobSchema.parse({
	objectKey: "source/slots/a/planet.pmtiles",
	archive: {
		observedAt: 1000,
		version: "4.0.0",
		blake3: "e".repeat(64),
		bytes: fixture.bytes.length,
		key: "20261013.pmtiles",
	},
	id: "d".repeat(64),
});

process.stdout.write(
	JSON.stringify({
		source: source,
		objects: Array.from(objects, ([key, bytes]) => ({
			key: key,
			body: Buffer.from(bytes).toString("base64"),
		})),
		importJob: importJob,
	}),
);
