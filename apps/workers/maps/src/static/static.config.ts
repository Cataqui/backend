import { instancePerContainerCachingFactory, registry } from "tsyringe";
import { MapsEnvironment } from "../environment.config";
import { StaticSigningKeySchema } from "./static-signing-key.schema";

export const StaticConfig = Symbol("StaticConfig");
export interface StaticConfig {
	environment: MapsEnvironment["ENVIRONMENT"];
	baseUrl: string;
	signingKey: string;
}

@registry([
	{
		token: StaticConfig,
		useFactory: instancePerContainerCachingFactory<StaticConfig>((container) => {
			const environment = container.resolve<MapsEnvironment>(MapsEnvironment);
			return {
				environment: environment.ENVIRONMENT,
				baseUrl: environment.STATIC_BASE_URL,
				signingKey: StaticSigningKeySchema.parse(environment.STATIC_MAP_LOCATION_SIGNING_KEY_BASE64URL),
			};
		}),
	},
])
export class StaticConfigRegistry {}
