import { registerAs } from "@nestjs/config";

export const THROTTLE_CONFIG_KEY = "throttle";

export interface IThrottleConfig {
	ttl: number;
	limit: number;
}

export const throttleConfig = registerAs(
	THROTTLE_CONFIG_KEY,
	(): IThrottleConfig => ({
		ttl: 300_000,
		limit: 1_000,
	}),
);
