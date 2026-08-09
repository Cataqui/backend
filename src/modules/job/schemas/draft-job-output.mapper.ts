import type { z } from "zod";
import type { Prisma } from "../../../../generated/prisma/client.js";
import { JobLocationConstants } from "../constants/job-location.constants";
import { DraftJobOutputSchema } from "./draft-job-output.schema";

export function toDraftJobOutput(
	job: Prisma.JobGetPayload<{ include: { contact: true } }>,
): z.infer<typeof DraftJobOutputSchema> {
	const hasCompleteLocation =
		job.neighborhood !== null &&
		job.city !== null &&
		job.state !== null &&
		job.country !== null &&
		job.fuzzyLatitude !== null &&
		job.fuzzyLongitude !== null;

	const hasCompletePayment =
		job.paymentType !== null && job.paymentAmountPeriod !== null && job.paymentCurrency !== null;

	return DraftJobOutputSchema.parse({
		jobId: job.id,
		title: job.title,
		description: job.description,
		descriptionSummary: job.descriptionSummary,
		contactReference:
			job.contact === null
				? null
				: {
						contactId: job.contact.id,
						contactMethod: job.contact.contactMethod,
					},
		location: hasCompleteLocation
			? {
					neighborhood: job.neighborhood,
					city: job.city,
					state: job.state,
					country: job.country,
					latitude: job.fuzzyLatitude!.toNumber(),
					longitude: job.fuzzyLongitude!.toNumber(),
					areaRadius: JobLocationConstants.AREA_RADIUS_METERS,
				}
			: null,
		payment: hasCompletePayment
			? {
					type: job.paymentType,
					minAmount: job.paymentMinAmount?.toNumber() ?? null,
					maxAmount: job.paymentMaxAmount?.toNumber() ?? null,
					note: job.paymentNote,
					amountPeriod: job.paymentAmountPeriod,
					currency: job.paymentCurrency,
				}
			: null,
		status: job.status,
		type: job.type,
		createdAt: job.createdAt.toISOString(),
		updatedAt: job.updatedAt.toISOString(),
	});
}
