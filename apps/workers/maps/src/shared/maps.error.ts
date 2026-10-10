import type { MapsErrorCode } from "./maps-error-code.enum";

export class MapsError extends Error {
	constructor(params: {
		errorCode: MapsErrorCode;
		message?: string;
		retryable?: boolean;
		retryAfterMs?: number | undefined;
	}) {
		super(params.message);
		this.name = new.target.name;
		this.errorCode = params.errorCode;
		this.retryable = params.retryable ?? false;
		this.retryAfterMs = params.retryAfterMs;
	}
	readonly errorCode: MapsErrorCode;
	readonly retryable: boolean;
	readonly retryAfterMs: number | undefined;
}
