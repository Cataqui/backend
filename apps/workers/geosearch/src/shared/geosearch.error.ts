import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { GeosearchErrorCode } from "./geosearch-error-code.enum";

export abstract class GeosearchError extends Error {
	constructor(params: {
		errorCode: GeosearchErrorCode;
		message: string;
		status: ContentfulStatusCode;
		headers?: Record<string, string>;
	}) {
		super(params.message);
		this.errorCode = params.errorCode;
		this.headers = params.headers;
		this.name = new.target.name;
		this.status = params.status;
	}

	readonly errorCode: GeosearchErrorCode;
	readonly headers: Record<string, string> | undefined;
	readonly status: ContentfulStatusCode;
}
