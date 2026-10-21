import { z } from "zod";

// Canonical keys in persisted promotion assets and R2 object-listing responses.
export const SourceImportStorageReadKeySchema = z
	.string()
	.min(1)
	.max(1024)
	.regex(/^(?:[A-Za-z0-9][A-Za-z0-9._-]*\/)*[A-Za-z0-9][A-Za-z0-9._-]*$/);
