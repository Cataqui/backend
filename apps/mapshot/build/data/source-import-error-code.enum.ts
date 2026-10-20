export const SourceImportErrorCode = {
	ABORTED: "ABORTED",
	STORAGE: "STORAGE",
	CONFLICT: "CONFLICT",
	SOURCE: "SOURCE",
	INTEGRITY: "INTEGRITY",
	INVALID_INPUT: "INVALID_INPUT",
	ATTEMPTS_EXHAUSTED: "ATTEMPTS_EXHAUSTED",
	PREPARATION: "PREPARATION",
} as const;

export type SourceImportErrorCode = (typeof SourceImportErrorCode)[keyof typeof SourceImportErrorCode];
