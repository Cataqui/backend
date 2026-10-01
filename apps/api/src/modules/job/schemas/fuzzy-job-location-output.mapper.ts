import type { z } from "zod";
import { JobLocationConstants } from "../constants/job-location.constants";
import type { FuzzyJobLocationOutputSchema } from "./fuzzy-job-location-output.schema";

export function toFuzzyJobLocationOutput(params: {
	fuzzyLatitude: number | { toNumber(): number };
	fuzzyLongitude: number | { toNumber(): number };
	imageAccessToken: string;
}): z.output<typeof FuzzyJobLocationOutputSchema> {
	return {
		latitude: typeof params.fuzzyLatitude === "number" ? params.fuzzyLatitude : params.fuzzyLatitude.toNumber(),
		longitude: typeof params.fuzzyLongitude === "number" ? params.fuzzyLongitude : params.fuzzyLongitude.toNumber(),
		areaRadius: JobLocationConstants.AREA_RADIUS_METERS,
		image: { accessToken: params.imageAccessToken },
	};
}
