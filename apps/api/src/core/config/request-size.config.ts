import { registerAs } from "@nestjs/config";

export interface IRequestSizeConfig {
	bodyLimitBytes: number;
	urlLengthLimitBytes: number;
	requestTimeoutMs: number;
	connectionTimeoutMs: number;
	handlerTimeoutMs: number;
	keepAliveTimeoutMs: number;
}

export const requestSizeConfig = registerAs(
	"requestSize",
	(): IRequestSizeConfig => ({
		bodyLimitBytes: 512 * 1024,
		urlLengthLimitBytes: 8 * 1024,
		requestTimeoutMs: 10_000,
		connectionTimeoutMs: 0,
		handlerTimeoutMs: 60_000,
		keepAliveTimeoutMs: 5_000,
	}),
);
