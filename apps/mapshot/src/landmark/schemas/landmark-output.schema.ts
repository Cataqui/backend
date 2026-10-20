import { z } from "zod";
import { PlaceCategory } from "@cataqui/places";

export const LandmarkOutputSchema = z
	.strictObject({
		id: z.string().min(1),
		label: z.string(),
		alternativeLabels: z.array(z.string().min(1)),
		category: z.enum(PlaceCategory.values),
		coordinates: z.strictObject({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }),
		rank: z.number().int().nonnegative(),
		sourceMinZoom: z.number().nullable(),
	})
	.refine(
		(landmark) =>
			landmark.label.trim().length > 0 || landmark.alternativeLabels.some((label) => label.trim().length > 0),
		{
			message: "A landmark requires a source label",
			path: ["label"],
		},
	);

export type LandmarkOutput = z.output<typeof LandmarkOutputSchema>;
