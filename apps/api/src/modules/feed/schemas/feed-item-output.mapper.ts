import type { z } from "zod";
import type { FuzzyJobLocationOutputSchema } from "../../job/schemas/fuzzy-job-location-output.schema";
import { FeedItemOutputSchema } from "./feed-item-output.schema";

export function toFeedItemOutput(params: {
	location: z.output<typeof FuzzyJobLocationOutputSchema>;
	job: {
		id: string;
		title: string;
		createdAt: Date;
		descriptionSummary: string;
		payment: string | null;
	};
}): z.infer<typeof FeedItemOutputSchema> {
	return {
		jobId: params.job.id,
		title: params.job.title,
		createdAt: params.job.createdAt.toISOString(),
		descriptionSummary: params.job.descriptionSummary,
		payment: params.job.payment,
		location: params.location,
	};
}
