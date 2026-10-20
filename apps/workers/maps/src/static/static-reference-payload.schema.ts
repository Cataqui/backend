import { z } from "zod";
import { GetStaticMapLocationUrlInputSchema } from "./get-static-map-location-url-input.schema";

export const StaticReferencePayloadSchema = z.strictObject({
	version: z.literal(1),
	environment: z.enum(["development", "staging", "production"]),
	center: GetStaticMapLocationUrlInputSchema,
});

export type StaticReferencePayload = z.output<typeof StaticReferencePayloadSchema>;
