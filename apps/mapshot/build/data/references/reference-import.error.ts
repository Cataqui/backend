import { ReferenceImportErrorCode } from "./reference-import-error-code.enum.ts";

export class ReferenceImportError extends Error {
	readonly code: ReferenceImportErrorCode;
	constructor(params: { code: ReferenceImportErrorCode; message?: string }) {
		super(params.message ?? `Mapshot reference import ${params.code} failure.`);
		this.name = "ReferenceImportError";
		this.code = params.code;
	}
}
