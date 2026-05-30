import { registerAs } from "@nestjs/config";

export const REQUEST_SIZE_CONFIG_KEY = "requestSize";

export interface IRequestSizeConfig {
	bodyLimitBytes: number;
	urlLengthLimitBytes: number;
	requestTimeoutMs: number;
	connectionTimeoutMs: number;
	keepAliveTimeoutMs: number;
}

export const requestSizeConfig = registerAs(
	REQUEST_SIZE_CONFIG_KEY,
	(): IRequestSizeConfig => ({
		bodyLimitBytes: 512 * 1024,
		urlLengthLimitBytes: 8 * 1024,
		requestTimeoutMs: 10_000,
		connectionTimeoutMs: 5_000,
		keepAliveTimeoutMs: 5_000,
	}),
);
