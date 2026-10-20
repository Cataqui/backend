import type { AppErrorCode } from "./app-error-code.enum";

export abstract class AppError extends Error {
	constructor(params: {
		errorCode: AppErrorCode;
		message: string;
	}) {
		super(params.message);
		this.name = new.target.name;
		this.errorCode = params.errorCode;
	}
	readonly errorCode: AppErrorCode;
}
