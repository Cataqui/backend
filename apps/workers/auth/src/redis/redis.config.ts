import { instancePerContainerCachingFactory, registry } from "tsyringe";
import { AuthEnvironment } from "../environment.config";

export const RedisConfig = Symbol("RedisConfig");
export interface RedisConfig {
	url: string;
	token: string;
	enableAutoPipelining: boolean;
}

@registry([
	{
		token: RedisConfig,
		useFactory: instancePerContainerCachingFactory<RedisConfig>((container) => {
			const environment = container.resolve<AuthEnvironment>(AuthEnvironment);
			return {
				url: environment.UPSTASH_REDIS_REST_URL,
				token: environment.UPSTASH_REDIS_REST_TOKEN,
				enableAutoPipelining: false,
			};
		}),
	},
])
export class RedisConfigRegistry {}
