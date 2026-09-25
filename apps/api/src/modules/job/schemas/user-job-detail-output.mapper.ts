import type { z } from "zod";
import { JobLocationConstants } from "../constants/job-location.constants";
import type { UserJobDetailRaw } from "../repositories/job.repository";
import type { UserJobDetailOutputSchema } from "./user-job-detail-output.schema";

export function toUserJobDetailOutput(job: UserJobDetailRaw): z.infer<typeof UserJobDetailOutputSchema> {
	return {
		jobId: job.id,
		title: job.title,
		description: job.description,
		descriptionSummary: job.descriptionSummary,
		contact: job.contact === null ? null : { method: job.contact.contactMethod, identifier: job.contact.identifier },
		location: {
			title: job.locationTitle,
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
