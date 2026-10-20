import { SourceImportErrorCode } from "./source-import-error-code.enum";

export class SourceImportError extends Error {
	readonly code: SourceImportErrorCode;
	readonly retryable: boolean;

	constructor(params: { code: SourceImportErrorCode }) {
		super(`Mapshot source import failed: ${params.code}.`);
		this.name = "SourceImportError";
		this.code = params.code;
		this.retryable = [
			SourceImportErrorCode.ABORTED,
			SourceImportErrorCode.STORAGE,
			SourceImportErrorCode.CONFLICT,
			SourceImportErrorCode.SOURCE,
			SourceImportErrorCode.PREPARATION,
		].some((code) => code === params.code);
	}
}
