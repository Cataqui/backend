import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { MapsErrorCode } from "./maps-error-code.enum";

export abstract class AppError extends Error {
	readonly errorCode: MapsErrorCode;
	readonly status: ContentfulStatusCode;

	constructor(params: { errorCode: MapsErrorCode; message: string; status: ContentfulStatusCode }) {
		super(params.message);
		this.name = new.target.name;
		this.errorCode = params.errorCode;
		this.status = params.status;
	}
}
