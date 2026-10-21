import { z } from "zod";

// R2's unquoted opaque token; suitable for private JSON and native conditional storage calls.
export const SourceImportStorageEtagSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/);
