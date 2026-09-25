import type { z } from "zod";
import { JobLocationConstants } from "../constants/job-location.constants";
import type { UserJobRaw } from "../repositories/job.repository";
import type { UserJobOutputSchema } from "./user-job-output.schema";

export function toUserJobOutput(job: UserJobRaw): z.infer<typeof UserJobOutputSchema> {
	return {
		jobId: job.id,
		description: job.description,
		contact: job.contact === null ? null : { method: job.contact.contactMethod, identifier: job.contact.identifier },
		location: {
			title: job.locationTitle,
			latitude: job.fuzzyLatitude.toNumber(),
			longitude: job.fuzzyLongitude.toNumber(),
			areaRadius: JobLocationConstants.AREA_RADIUS_METERS,
		},
		status: job.status,
		createdAt: job.createdAt.toISOString(),
		updatedAt: job.updatedAt.toISOString(),
	};
}
