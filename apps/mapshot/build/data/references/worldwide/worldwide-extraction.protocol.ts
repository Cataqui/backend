import type { ReferenceImportErrorCode } from "../reference-import-error-code.enum.ts";

export type WorldwideWorkerTask =
	| { operation: "extract"; bytes: ArrayBuffer; records: ArrayBuffer }
	| { operation: "finish" };
export type WorldwideWorkerResult =
	| { kind: "extracted" }
	| {
			kind: "finished";
			file: { path: string; bytes: number; lines: number; sha256: string };
			sharedContents: number;
	  }
	| { kind: "error"; code: ReferenceImportErrorCode; message: string };
