export const ReferenceImportErrorCode = {
	INVALID_ARCHIVE: "INVALID_ARCHIVE",
	INTEGRITY: "INTEGRITY",
	INCOMPLETE: "INCOMPLETE",
	CAPACITY: "CAPACITY",
	STAGING_CONFLICT: "STAGING_CONFLICT",
	CLOSED: "CLOSED",
	WORKER_EXITED: "WORKER_EXITED",
} as const;

export type ReferenceImportErrorCode = (typeof ReferenceImportErrorCode)[keyof typeof ReferenceImportErrorCode];
