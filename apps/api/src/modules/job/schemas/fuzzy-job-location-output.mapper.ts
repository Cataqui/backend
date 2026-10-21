import { FuzzyJobLocationOutputSchema } from "./fuzzy-job-location-output.schema";
import type { z } from "zod";

export function toFuzzyJobLocationOutput(params: {
	fuzzyLatitude: number | { toNumber(): number };
	fuzzyLongitude: number | { toNumber(): number };
	locationImageUrl: string | null;
}): z.output<typeof FuzzyJobLocationOutputSchema> {
	return {
		latitude: typeof params.fuzzyLatitude === "number" ? params.fuzzyLatitude : params.fuzzyLatitude.toNumber(),
		longitude: typeof params.fuzzyLongitude === "number" ? params.fuzzyLongitude : params.fuzzyLongitude.toNumber(),
		areaRadius: 2000,
		imageUrl: FuzzyJobLocationOutputSchema.shape.imageUrl.parse(params.locationImageUrl),
	};
}
