import { createPlacesService } from "../places/places.module";
import { createMapsConfig } from "../../shared/config/maps.config";
import { LandmarkService } from "./landmarks/landmark.service";
import { StaticRepository } from "./static.repository";
import { StaticService } from "./static.service";

/** Compose the static capability at Worker, HTTP, and Durable Object entrypoints. */
export function createStaticService(params: { environment: MapsWorkerEnv }): StaticService {
	const { placesConfig, staticConfig } = createMapsConfig({ environment: params.environment });
	const repository = new StaticRepository({
		bucket: params.environment.STATIC_IMAGES,
		images: params.environment.IMAGES,
		generation: params.environment.GENERATION,
		staticConfig: staticConfig,
	});

	return new StaticService({
		repository: repository,
		landmarks: new LandmarkService({
			places: createPlacesService({
				placesConfig: placesConfig,
				searchRateLimiter: params.environment.PLACE_SEARCH_RATE_LIMITER,
				detailsRateLimiter: params.environment.PLACE_DETAILS_RATE_LIMITER,
			}),
		}),
		staticConfig: staticConfig,
	});
}
