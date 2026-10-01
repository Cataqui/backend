import type { z } from "zod";
import type { FuzzyJobLocationOutputSchema } from "./fuzzy-job-location-output.schema";
import type { PublicJobRaw } from "../repositories/job.repository";
import type { PublicJobOutputSchema } from "./public-job-output.schema";

export function toPublicJobOutput(params: {
	job: PublicJobRaw;
	location: z.output<typeof FuzzyJobLocationOutputSchema>;
}): z.infer<typeof PublicJobOutputSchema> {
	return {
		jobId: params.job.id,
		title: params.job.title,
		description: params.job.description,
		descriptionSummary: params.job.descriptionSummary,
		contactReference: { contactId: params.job.contact!.id, method: params.job.contact!.contactMethod },
		location: params.location,
		payment: params.job.payment,
		status: params.job.status,
		createdAt: params.job.createdAt.toISOString(),
		updatedAt: params.job.updatedAt.toISOString(),
	};
}
