import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppErrorCode } from "./app-error-code.enum";

export abstract class AppError extends Error {
	readonly errorCode: AppErrorCode;
	readonly status: ContentfulStatusCode;

	constructor(params: { errorCode: AppErrorCode; message: string; status: ContentfulStatusCode }) {
		super(params.message);
		this.name = new.target.name;
		this.errorCode = params.errorCode;
		this.status = params.status;
	}
}
