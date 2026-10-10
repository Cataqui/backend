import type { PlacesConfig } from "../../modules/places/schemas/places-config.schema";
import type { StaticConfig } from "../../modules/static/schemas/static-config.schema";
import { EnvSchema, type Env } from "./env.schema";

export function createMapsConfig(params: { environment: Pick<MapsWorkerEnv, keyof Env> }): {
	placesConfig: PlacesConfig;
	staticConfig: StaticConfig;
} {
	const environment = EnvSchema.parse({
		ENVIRONMENT: params.environment.ENVIRONMENT,
		MICROSERVICES_AUTH_JWKS_URL: params.environment.MICROSERVICES_AUTH_JWKS_URL,
		STATIC_BASE_URL: params.environment.STATIC_BASE_URL,
		GOOGLE_PLACES_API_KEY: params.environment.GOOGLE_PLACES_API_KEY,
		GEOAPIFY_API_KEY: params.environment.GEOAPIFY_API_KEY,
	});

	return {
		placesConfig: {
			googlePlacesApiKey: environment.GOOGLE_PLACES_API_KEY,
			geoapifyApiKey: environment.GEOAPIFY_API_KEY,
		},
		staticConfig: {
			geoapifyApiKey: environment.GEOAPIFY_API_KEY,
			environment: environment.ENVIRONMENT,
			baseUrl: environment.STATIC_BASE_URL,
		},
	};
}
