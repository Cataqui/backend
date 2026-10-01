import type { z } from "zod";
import type { FuzzyJobLocationOutputSchema } from "./fuzzy-job-location-output.schema";
import type { UserJobRaw } from "../repositories/job.repository";
import type { UserJobOutputSchema } from "./user-job-output.schema";

export function toUserJobOutput(params: {
	job: UserJobRaw;
	location: z.output<typeof FuzzyJobLocationOutputSchema>;
}): z.infer<typeof UserJobOutputSchema> {
	return {
		jobId: params.job.id,
		description: params.job.description,
		contact:
			params.job.contact === null
				? null
				: { method: params.job.contact.contactMethod, identifier: params.job.contact.identifier },
		location: { ...params.location, title: params.job.locationTitle },
		status: params.job.status,
		createdAt: params.job.createdAt.toISOString(),
		updatedAt: params.job.updatedAt.toISOString(),
	};
}
