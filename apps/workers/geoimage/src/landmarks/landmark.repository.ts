import { z } from "zod";
import { GeoimageErrorCode } from "../geoimage-error-code.enum";
import { GeoimageError } from "../geoimage.error";
import type { GeoapifyConfig } from "../maps/geoapify.config";
import { findLandmarkCategory, LandmarkCategories, LandmarkQueryGroups } from "./landmark-category";
import type { LandmarkPlace } from "./landmark-place.interface";
import { GeoapifyPlaceSchema } from "./schemas/geoapify-place.schema";

// Tagged as tourist attractions in OpenStreetMap but rarely known by name: statues, plaques and viewpoints.
const IGNORED_TOURISM_TAGS = new Set(["artwork", "viewpoint"]);
const IGNORED_HISTORIC_TAGS = new Set(["memorial", "monument"]);

export class LandmarkRepository {
	private readonly _config: GeoapifyConfig;

	constructor(params: { config: GeoapifyConfig }) {
		this._config = params.config;
	}

	async findPlaces(params: {
		bounds: { north: number; south: number; east: number; west: number };
	}): Promise<LandmarkPlace[]> {
		const groups = await Promise.all(
			LandmarkQueryGroups.map((group) =>
				this._fetchPlaces({
					bounds: params.bounds,
					categories: group.categories.flatMap((category) => LandmarkCategories[category].geoapifyCategories),
					limit: group.limit,
				}),
			),
		);
		return groups.flat();
	}

	private async _fetchPlaces(params: {
		bounds: { north: number; south: number; east: number; west: number };
		categories: string[];
		limit: number;
	}): Promise<LandmarkPlace[]> {
		const url = new URL("https://api.geoapify.com/v2/places");
		url.search = new URLSearchParams({
			categories: params.categories.join(","),
			filter: `rect:${params.bounds.west},${params.bounds.north},${params.bounds.east},${params.bounds.south}`,
			limit: String(params.limit),
			lang: "pt",
			apiKey: this._config.apiKey,
		}).toString();

		let response: Response;
		try {
			response = await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: "manual" });
		} catch (error) {
			if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
				throw new GeoimageError(GeoimageErrorCode.PROVIDER_TIMEOUT);
			}
			throw new GeoimageError(GeoimageErrorCode.PROVIDER_UNAVAILABLE);
		}
		if (!response.ok) throw new GeoimageError(GeoimageErrorCode.PROVIDER_UNAVAILABLE);

		const body = z.object({ features: z.array(z.unknown()) }).safeParse(await response.json().catch(() => null));
		if (!body.success) throw new GeoimageError(GeoimageErrorCode.PROVIDER_UNAVAILABLE);

		return body.data.features.flatMap((feature) => {
			const place = GeoapifyPlaceSchema.safeParse(feature);
			if (!place.success) return [];
			const properties = place.data.properties;
			const raw = properties.datasource?.raw;
			const category = findLandmarkCategory(properties.categories);
			// OpenStreetMap separates alternative values with semicolons; the first one is the primary name.
			const name = (raw?.short_name ?? properties.name)?.split(";")[0]?.trim();
			if (category === undefined || name === undefined || name.length === 0) return [];
			if (raw?.tourism !== undefined && IGNORED_TOURISM_TAGS.has(raw.tourism)) return [];
			if (raw?.historic !== undefined && IGNORED_HISTORIC_TAGS.has(raw.historic)) return [];

			return [
				{
					name: name,
					category: category,
					coordinates: { latitude: properties.lat, longitude: properties.lon },
					notable: raw?.wikidata !== undefined,
					...(raw?.brand === undefined ? {} : { brand: raw.brand }),
				},
			];
		});
	}
}
