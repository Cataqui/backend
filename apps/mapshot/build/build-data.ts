import { readFileSync } from "node:fs";
import { BasemapSourceCandidateSchema } from "../src/tiles/sources/schemas/basemap-source-candidate.schema";
import { getBasemapIndexFiles } from "../src/tiles/sources/indexes/basemap-index-manifest";
import { BasemapIndexManifestSchema } from "../src/tiles/sources/indexes/schemas/basemap-index-manifest.schema";

// Ruby uses the application's authoritative data contracts through this adapter.
export async function validateMapshotBuildData(params: { kind: string; value: unknown }): Promise<unknown> {
	if (params.kind === "source") return BasemapSourceCandidateSchema.parse(params.value);
	if (params.kind === "index-manifest") {
		const manifest = BasemapIndexManifestSchema.parse(params.value);
		return { manifest: manifest, files: getBasemapIndexFiles({ manifest: manifest }) };
	}
	throw new TypeError("Unsupported Mapshot build data validation operation.");
}

export async function runMapshotBuildDataCli(params: { args: string[]; input: string }): Promise<number> {
	try {
		if (params.args.length !== 1) throw new TypeError("Mapshot build data validation requires one operation.");
		const value = await validateMapshotBuildData({ kind: params.args[0]!, value: JSON.parse(params.input) });
		process.stdout.write(JSON.stringify(value));
		return 0;
	} catch {
		console.error("Mapshot build data validation failed.");
		return 1;
	}
}

if (import.meta.main) {
	process.exitCode = await runMapshotBuildDataCli({ args: process.argv.slice(2), input: readFileSync(0, "utf8") });
}
