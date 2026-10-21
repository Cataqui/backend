import { z } from "zod";
import { BasemapResourceRevisionSchema } from "../../../src/tiles/schemas/basemap-resource-revision.schema";
import { BasemapSourceReleaseSchema } from "../../../src/tiles/sources/schemas/basemap-source-release.schema";
import { EngineFixtureMapInputSchema } from "./engine-fixture-map-input.schema";

/** Finite, content-pinned source bytes used only by the Linux production-boundary gate. */
export const EngineFixtureSchema = z.strictObject({
	schemaVersion: z.literal(1),
	source: BasemapSourceReleaseSchema,
	provenance: z.strictObject({
		source: z.url(),
		etag: z.string().min(1),
		releaseEnvelope: z.literal("synthetic-test-only"),
		cataloguePolicy: z.string().min(1),
	}),
	resources: z.array(
		z.strictObject({
			file: z.string().regex(/^tiles\/\d+-\d+-\d+\.mvt\.gz$/u),
			compressedBytes: z.number().int().positive(),
			compressedSha256: BasemapResourceRevisionSchema.shape.id,
			revision: BasemapResourceRevisionSchema,
		}),
	),
	snapshots: z.array(
		z.strictObject({
			id: z.string().regex(/^[a-z0-9-]+$/u),
			input: EngineFixtureMapInputSchema,
			expected: z.strictObject({
				pixelSha256: BasemapResourceRevisionSchema.shape.id,
				visibleLandmarkIds: z.array(z.string().min(1)),
			}),
		}),
	),
});

export type EngineFixture = z.output<typeof EngineFixtureSchema>;
