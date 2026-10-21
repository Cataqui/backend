import { instancePerContainerCachingFactory, registry } from "tsyringe";
import { MapsEnvironment } from "../environment.config";

export const PlacesConfig = Symbol("PlacesConfig");
export interface PlacesConfig {
	googlePlacesApiKey: string;
}

@registry([
	{
		token: PlacesConfig,
		useFactory: instancePerContainerCachingFactory<PlacesConfig>((container) => ({
			googlePlacesApiKey: container.resolve<MapsEnvironment>(MapsEnvironment).GOOGLE_PLACES_API_KEY,
		})),
	},
])
export class PlacesConfigRegistry {}
