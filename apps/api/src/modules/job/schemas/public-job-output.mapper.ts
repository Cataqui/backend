import type { z } from "zod";
import { JobLocationConstants } from "../constants/job-location.constants";
import type { PublicJobRaw } from "../repositories/job.repository";
import type { PublicJobOutputSchema } from "./public-job-output.schema";

export function toPublicJobOutput(job: PublicJobRaw): z.infer<typeof PublicJobOutputSchema> {
	return {
		jobId: job.id,
		title: job.title,
		description: job.description,
		descriptionSummary: job.descriptionSummary,
		contactReference: { contactId: job.contact!.id, method: job.contact!.contactMethod },
		location: {
			latitude: job.fuzzyLatitude.toNumber(),
			longitude: job.fuzzyLongitude.toNumber(),
			areaRadius: JobLocationConstants.AREA_RADIUS_METERS,
		},
		payment: job.payment,
		status: job.status,
		createdAt: job.createdAt.toISOString(),
		updatedAt: job.updatedAt.toISOString(),
	};
}
