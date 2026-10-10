import { PlacesService } from "./places.service";
import { PlacesRepository } from "./places.repository";
import type { PlacesConfig } from "./schemas/places-config.schema";

export function createPlacesService(params: {
	placesConfig: PlacesConfig;
	searchRateLimiter: RateLimit;
	detailsRateLimiter: RateLimit;
}): PlacesService {
	return new PlacesService({
		repository: new PlacesRepository({
			placesConfig: params.placesConfig,
			searchRateLimiter: params.searchRateLimiter,
			detailsRateLimiter: params.detailsRateLimiter,
		}),
	});
}
