import type { z } from "zod";
import { JobLocationConstants } from "../../job/constants/job-location.constants";
import { FeedItemOutputSchema } from "./feed-item-output.schema";

function _toNumber(value: { toNumber(): number } | number): number {
	return typeof value === "number" ? value : value.toNumber();
}

export function toFeedItemOutput(params: {
	job: {
		id: string;
		title: string;
		createdAt: Date;
		descriptionSummary: string;
		payment: string;
		fuzzyLatitude: { toNumber(): number } | number;
		fuzzyLongitude: { toNumber(): number } | number;
	};
}): z.infer<typeof FeedItemOutputSchema> {
	return {
		jobId: params.job.id,
		title: params.job.title,
		createdAt: params.job.createdAt.toISOString(),
		descriptionSummary: params.job.descriptionSummary,
		payment: params.job.payment,
		location: {
			latitude: _toNumber(params.job.fuzzyLatitude),
			longitude: _toNumber(params.job.fuzzyLongitude),
			areaRadius: JobLocationConstants.AREA_RADIUS_METERS,
		},
	};
}
