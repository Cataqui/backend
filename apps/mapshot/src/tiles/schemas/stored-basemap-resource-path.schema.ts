import { z } from "zod";
import { PmtilesTileInputSchema } from "../pmtiles/schemas/pmtiles-tile-input.schema";

type StoredBasemapResourceLocation = { kind: "tile"; id: string; z: number; x: number; y: number };

export function parseStoredBasemapResourcePath(params: { path: string }): StoredBasemapResourceLocation | null {
	const tile = /^\/tiles\/([a-f0-9]{64})\/(0|[1-9]\d*)\/(0|[1-9]\d*)\/(0|[1-9]\d*)\.mvt$/.exec(params.path);
	if (tile !== null) {
		const coordinates = PmtilesTileInputSchema.safeParse({
			z: Number(tile[2]),
			x: Number(tile[3]),
			y: Number(tile[4]),
		});
		if (!coordinates.success) return null;
		return { kind: "tile", id: tile[1]!, z: coordinates.data.z, x: coordinates.data.x, y: coordinates.data.y };
	}
	return null;
}

/** Owned immutable paths, with a single canonical encoding for each resource. */
export const StoredBasemapResourcePathSchema = z
	.string()
	.refine(
		(path) => parseStoredBasemapResourcePath({ path: path }) !== null,
		"The stored basemap resource path is not supported.",
	);
