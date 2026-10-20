import * as td from "testdouble";
import { afterEach, describe, expect, it } from "vitest";
import { createIndexFixture } from "../../../../test/basemap-index.fixture";
import { getBasemapIndexFiles, readBasemapIndexHeader } from "./basemap-index-manifest";
import type { BasemapIndexManifest } from "./schemas/basemap-index-manifest.schema";

afterEach(() => td.reset());

describe("prepared basemap index header and files", () => {
	it.each([{}, { rootOnly: true }, { leavesAfterTiles: true }])(
		"reads bounded PMTiles geometry %o",
		async (options) => {
			const fixture = await createIndexFixture(options);
			const header = readBasemapIndexHeader({ bytes: fixture.bytes, archive: fixture.manifest.archive });
			expect(header.rootDirectoryOffset).toBe(127);
			expect(header.tileDataOffset).toBe(fixture.tileOffset);
			expect(header.tileDataLength).toBe(fixture.tile.length);
		},
	);
	it.each([
		{ kind: "short", at: 0, value: 0 },
		{ kind: "magic", at: 0, value: 0 },
		{ kind: "version", at: 7, value: 2 },
		{ kind: "tile-type", at: 99, value: 2 },
		{ kind: "internal-compression", at: 97, value: 3 },
		{ kind: "tile-compression", at: 98, value: 4 },
		{ kind: "minimum-zoom", at: 100, value: 1 },
		{ kind: "maximum-zoom", at: 101, value: 2 },
	])("rejects invalid %s header fields", async ({ kind, at, value }) => {
		const fixture = await createIndexFixture();
		const bytes = kind === "short" ? fixture.bytes.slice(0, 126) : fixture.bytes.slice(0, 127);
		bytes[at] = value;
		expect(() => readBasemapIndexHeader({ bytes: bytes, archive: fixture.manifest.archive })).toThrow();
	});
	it.each([
		{ kind: "root-before-header", at: 8, value: 126n },
		{ kind: "empty-root", at: 16, value: 0n },
		{ kind: "oversized-root", at: 16, value: 16384n },
		{ kind: "leaf-before-root", at: 40, value: 127n },
		{ kind: "leaf-outside-archive", at: 48, value: 16384n },
		{ kind: "tiles-before-root", at: 56, value: 127n },
		{ kind: "tiles-overlap-leaf", at: 56, value: 16384n },
		{ kind: "empty-tiles", at: 64, value: 0n },
		{ kind: "tiles-outside-archive", at: 64, value: 16384n },
		{ kind: "unsafe-root-offset", at: 8, value: 9007199254740992n },
		{ kind: "unsafe-leaf-end", at: 40, value: 9007199254740991n },
		{ kind: "unsafe-tile-end", at: 56, value: 9007199254740991n },
	])("rejects %s section geometry", async ({ at, value }) => {
		const fixture = await createIndexFixture();
		const bytes = fixture.bytes.slice(0, 127);
		new DataView(bytes.buffer).setBigUint64(at, value, true);
		expect(() => readBasemapIndexHeader({ bytes: bytes, archive: fixture.manifest.archive })).toThrow();
	});
	it("deduplicates identical files shared by multiple metadata references", async () => {
		const fixture = await createIndexFixture();
		fixture.manifest.metadata.leaves.push({ file: fixture.manifest.metadata.headerRoot, originalOffset: 0 });
		expect(getBasemapIndexFiles({ manifest: fixture.manifest })).toHaveLength(2);
	});
	it.each(["bytes", "sha256"] as const)("rejects inconsistent %s for one installed path", async (field) => {
		const fixture = await createIndexFixture();
		const duplicate = structuredClone(fixture.manifest.metadata.headerRoot);
		if (field === "bytes") duplicate.bytes++;
		else duplicate.sha256 = "f".repeat(64);
		fixture.manifest.metadata.leaves.push({ file: duplicate, originalOffset: 0 });
		expect(() => getBasemapIndexFiles({ manifest: fixture.manifest })).toThrow();
	});
	it("includes only the header and root when the leaf collection is empty", async () => {
		const fixture = await createIndexFixture({ rootOnly: true });
		const manifest: BasemapIndexManifest = {
			version: fixture.manifest.version,
			archive: fixture.manifest.archive,
			landmarks: fixture.manifest.landmarks,
			metadata: { headerRoot: fixture.manifest.metadata.headerRoot, leaves: [] },
		};
		expect(getBasemapIndexFiles({ manifest: manifest })).toHaveLength(1);
	});
});
