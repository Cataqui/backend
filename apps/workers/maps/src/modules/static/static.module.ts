import { StaticRepository } from "./static.repository";
import { StaticService } from "./static.service";

/** Compose the static capability at Worker, HTTP, and Durable Object entrypoints. */
export function createStaticService(params: { environment: MapsWorkerEnv }): StaticService {
	return new StaticService({
		repository: new StaticRepository({
			bucket: params.environment.STATIC_IMAGES,
			images: params.environment.IMAGES,
			generation: params.environment.GENERATION,
			apiKey: params.environment.GEOAPIFY_API_KEY,
		}),
		environment: params.environment.ENVIRONMENT,
		baseUrl: params.environment.STATIC_BASE_URL,
	});
}
