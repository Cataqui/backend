import type { z } from "zod";
import type { Prisma } from "../../../../generated/prisma/client.js";
import { JobLocationConstants } from "../constants/job-location.constants";
import { PublicJobOutputSchema } from "./public-job-output.schema";

export function toPublicJobOutput(
	job: Prisma.JobGetPayload<{ include: { contact: true } }>,
): z.infer<typeof PublicJobOutputSchema> {
	return PublicJobOutputSchema.parse({
		jobId: job.id,
		title: job.title,
		description: job.description,
		descriptionSummary: job.descriptionSummary,
		contactReference: {
			contactId: job.contact!.id,
			contactMethod: job.contact!.contactMethod,
		},
		location: {
			neighborhood: job.neighborhood,
			city: job.city,
			state: job.state,
			country: job.country,
			latitude: job.fuzzyLatitude!.toNumber(),
			longitude: job.fuzzyLongitude!.toNumber(),
			areaRadius: JobLocationConstants.AREA_RADIUS_METERS,
		},
		payment: {
			type: job.paymentType,
			minAmount: job.paymentMinAmount?.toNumber() ?? null,
			maxAmount: job.paymentMaxAmount?.toNumber() ?? null,
			note: job.paymentNote,
			amountPeriod: job.paymentAmountPeriod,
			currency: job.paymentCurrency,
		},
		status: job.status,
		type: job.type,
		createdAt: job.createdAt.toISOString(),
		updatedAt: job.updatedAt.toISOString(),
	});
}
