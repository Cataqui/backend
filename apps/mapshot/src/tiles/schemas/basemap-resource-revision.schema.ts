import { z } from "zod";
import { StoredBasemapResourcePathSchema } from "./stored-basemap-resource-path.schema";

/** Pins accepted, secret-free resource bytes independently of their current pointer. */
export const BasemapResourceRevisionSchema = z.strictObject({
	id: z.string().regex(/^[a-f0-9]{64}$/),
	path: StoredBasemapResourcePathSchema,
});

export type BasemapResourceRevision = z.output<typeof BasemapResourceRevisionSchema>;
