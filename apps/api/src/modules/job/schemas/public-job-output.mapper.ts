import type { z } from "zod";
import { JobStatus } from "../../../../generated/prisma/client.js";
import { JobLocationConstants } from "../constants/job-location.constants";
import type { PublicJobRaw } from "../repositories/job.repository";
import type { PublicJobOutputSchema } from "./public-job-output.schema";

export function toPublicJobOutput(job: PublicJobRaw): z.infer<typeof PublicJobOutputSchema> {
	if (job.status === JobStatus.DRAFT) throw new Error(`Draft job ${job.id} cannot be mapped to the public contract.`);

	return {
		jobId: job.id,
		title: job.title!,
		description: job.description,
		descriptionSummary: job.descriptionSummary!,
		contactReference: {
			contactId: job.contact!.id,
			contactMethod: job.contact!.contactMethod,
		},
		location: {
			latitude: job.fuzzyLatitude!.toNumber(),
			longitude: job.fuzzyLongitude!.toNumber(),
			areaRadius: JobLocationConstants.AREA_RADIUS_METERS,
		},
		payment: {
			type: job.paymentType!,
			minAmount: job.paymentMinAmount?.toNumber() ?? null,
			maxAmount: job.paymentMaxAmount?.toNumber() ?? null,
			note: job.paymentNote,
			amountPeriod: job.paymentAmountPeriod!,
			currency: job.paymentCurrency!,
		},
		status: job.status,
		type: job.type!,
		createdAt: job.createdAt.toISOString(),
		updatedAt: job.updatedAt.toISOString(),
	};
}
