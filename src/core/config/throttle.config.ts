import { registerAs } from "@nestjs/config";

export const GLOBAL_THROTTLE_CONFIG_KEY = "throttle";

export interface IGlobalThrottleConfig {
	ttl: number;
	limit: number;
}

export const globalThrottleConfig = registerAs(
	GLOBAL_THROTTLE_CONFIG_KEY,
	(): IGlobalThrottleConfig => ({
		ttl: 300_000,
		limit: 1_000,
	}),
);
