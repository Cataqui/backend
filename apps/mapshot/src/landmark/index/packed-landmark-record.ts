import type { PackedLandmarkRow } from "./schemas/packed-landmark-row.schema";

export interface PackedLandmarkRecord {
	id: string;
	label: string;
	alternativeLabels: string[];
	coordinates: { latitude: number; longitude: number };
	kind: PackedLandmarkRow[3];
	kindDetail: string | null;
	minZoom: number | null;
	rank: number | null;
}
