import { GeoapifyPlacesSchema } from "./schemas/geoapify-places.schema";
import { createGeoapifyHttpError } from "../modules/static/geoapify-http.error";
import { MapsErrorCode } from "../shared/maps-error-code.enum";
import { MapsError } from "../shared/maps.error";
import { GeoapifyConfigSchema } from "../modules/static/schemas/geoapify-config.schema";
import { findLandmarkCategory, LandmarkCategories, LandmarkQueryGroups } from "./landmark-category";
import type { LandmarkPlace } from "./landmark-place.interface";
import { GeoapifyPlaceSchema } from "./schemas/geoapify-place.schema";

// Tagged as tourist attractions in OpenStreetMap but rarely known by name: statues, plaques and viewpoints.
const IGNORED_TOURISM_TAGS = new Set(["artwork", "viewpoint"]);
const IGNORED_HISTORIC_TAGS = new Set(["memorial", "monument"]);

export class LandmarkRepository {
	private readonly _config: { apiKey: string };

	constructor(params: { config: { apiKey: string } }) {
		this._config = params.config;
	}

	async findPlaces(params: {
		bounds: { north: number; south: number; east: number; west: number };
		signal?: AbortSignal | undefined;
	}): Promise<LandmarkPlace[]> {
		const groups = await Promise.all(
			LandmarkQueryGroups.map((group) =>
				this._fetchPlaces({
					bounds: params.bounds,
					categories: group.categories.flatMap((category) => LandmarkCategories[category].geoapifyCategories),
					limit: group.limit,
					signal: params.signal,
				}),
			),
		);
		return groups.flat();
	}

	private async _fetchPlaces(params: {
		bounds: { north: number; south: number; east: number; west: number };
		signal?: AbortSignal | undefined;
		categories: string[];
		limit: number;
	}): Promise<LandmarkPlace[]> {
		const url = new URL("https://api.geoapify.com/v2/places");
		url.search = new URLSearchParams({
			categories: params.categories.join(","),
			filter: `rect:${params.bounds.west},${params.bounds.north},${params.bounds.east},${params.bounds.south}`,
			limit: String(params.limit),
			lang: "pt",
			apiKey: GeoapifyConfigSchema.parse(this._config).apiKey,
		}).toString();

		let response: Response;
		try {
			response = await fetch(url, {
				signal: AbortSignal.any([AbortSignal.timeout(10_000), ...(params.signal ? [params.signal] : [])]),
				redirect: "manual",
			});
		} catch (error) {
			if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
				throw new MapsError({ errorCode: MapsErrorCode.PROVIDER_TIMEOUT, retryable: true });
			}
			throw new MapsError({ errorCode: MapsErrorCode.PROVIDER_UNAVAILABLE, retryable: true });
		}
		if (!response.ok) {
			await response.body?.cancel().catch(() => undefined);
			throw createGeoapifyHttpError({ response: response });
		}

		const body = GeoapifyPlacesSchema.safeParse(await response.json().catch(() => null));
		if (!body.success) throw new MapsError({ errorCode: MapsErrorCode.PROVIDER_UNAVAILABLE, retryable: false });

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
