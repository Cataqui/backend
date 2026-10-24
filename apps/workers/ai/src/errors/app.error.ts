import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AiErrorCode } from "./ai-error-code.enum";

export abstract class AppError extends Error {
	readonly errorCode: AiErrorCode;
	readonly status: ContentfulStatusCode;

	constructor(params: { errorCode: AiErrorCode; message: string; status: ContentfulStatusCode }) {
		super(params.message);
		this.name = new.target.name;
		this.errorCode = params.errorCode;
		this.status = params.status;
	}
}
