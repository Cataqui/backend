import { BasemapSourceReleaseSchema } from "../src/tiles/sources/schemas/basemap-source-release.schema";
import {
	BasemapSourceCandidateSchema,
	type BasemapSourceCandidate,
} from "../src/tiles/sources/schemas/basemap-source-candidate.schema";

export function createDeploymentCandidate(params: { marker?: string } = {}): BasemapSourceCandidate {
	const marker = params.marker ?? "a";
	const release = BasemapSourceReleaseSchema.parse({
		schemaVersion: 1,
		pmtiles: {
			id: marker.repeat(64),
			objectKey: `source/import/attempts/${marker.repeat(64)}/1/archive.pmtiles`,
			bytes: 1000,
			etag: `${marker}-etag`,
			digest: { algorithm: "blake3", value: marker.repeat(64), verified: true },
			minZoom: 0,
			maxZoom: 15,
			coverage: "complete-planet",
		},
		references: {
			id: "d".repeat(64),
			catalogueKey: `source/import/attempts/${marker.repeat(64)}/1/references/catalogue.json`,
		},
	});
	return BasemapSourceCandidateSchema.parse({
		release: release,
		prepared: {
			manifestKey: `source/indexes/v1/${release.pmtiles.id}/${"e".repeat(64)}/manifest.json`,
			sha256: "e".repeat(64),
			bytes: 100,
			archiveId: release.pmtiles.id,
		},
	});
}
