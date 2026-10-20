import type { MapsWorkerEnv } from "../cloudflare.config.ts";
import type { DependencyContainer } from "tsyringe";
import { MapsEnvironment } from "./environment.config";
import { AuthBinding } from "./auth/auth.repository";
import { PlaceSearchRateLimiter, PlaceDetailsRateLimiter } from "./places/places.repository";
import { MapshotBinding } from "./static/static.repository";

export function registerMapsDependencies(params: { container: DependencyContainer; environment: MapsWorkerEnv }): void {
	params.container.register<MapsEnvironment>(MapsEnvironment, { useValue: params.environment });
	params.container.register(AuthBinding, { useFactory: () => params.environment.AUTH });
	params.container.register(MapshotBinding, { useFactory: () => params.environment.MAPSHOT });
	params.container.register(PlaceSearchRateLimiter, { useFactory: () => params.environment.PLACE_SEARCH_RATE_LIMITER });
	params.container.register(PlaceDetailsRateLimiter, {
		useFactory: () => params.environment.PLACE_DETAILS_RATE_LIMITER,
	});
}
