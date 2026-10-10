import type { LandmarkCategory } from "./landmark-category";

export interface LandmarkPlace {
	name: string;
	category: LandmarkCategory;
	coordinates: { latitude: number; longitude: number };
	// Has a Wikidata entry, the strongest open signal that people know the place by name.
	notable: boolean;
	brand?: string;
}
