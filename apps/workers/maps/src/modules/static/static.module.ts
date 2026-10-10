import { LandmarkCompositor } from "../../landmarks/landmark-compositor";
import { LandmarkRepository } from "../../landmarks/landmark.repository";
import { LandmarkService } from "../../landmarks/landmark.service";
import { StaticRepository } from "./static.repository";
import { StaticService } from "./static.service";

/** Compose the static capability at Worker, HTTP, and Durable Object entrypoints. */
export function createStaticService(params: { environment: MapsWorkerEnv }): StaticService {
	const repository = new StaticRepository({
		bucket: params.environment.STATIC_IMAGES,
		images: params.environment.IMAGES,
		generation: params.environment.GENERATION,
		apiKey: params.environment.GEOAPIFY_API_KEY,
	});
	return new StaticService({
		repository: repository,
		landmarks: new LandmarkService({
			repository: () => repository,
			landmarks: () => new LandmarkRepository({ config: { apiKey: params.environment.GEOAPIFY_API_KEY } }),
			compositor: () => new LandmarkCompositor(),
		}),
		environment: params.environment.ENVIRONMENT,
		baseUrl: params.environment.STATIC_BASE_URL,
	});
}
