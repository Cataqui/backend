import type { JobPaymentAmountPeriod, JobPaymentType } from "../../../../generated/prisma/client.js";
import { JobLocationConstants } from "../../job/constants/job-location.constants";
import { FeedItemOutputSchema } from "./feed-item-output.schema";
import type { z } from "zod";

function _toNumber(value: { toNumber(): number } | number): number {
	return typeof value === "number" ? value : value.toNumber();
}

export function toFeedItemOutput(params: {
	job: {
		id: string;
		title: string;
		createdAt: Date;
		descriptionSummary: string;
		paymentType: JobPaymentType;
		paymentMinAmount: { toNumber(): number } | number | null;
		paymentMaxAmount: { toNumber(): number } | number | null;
		paymentNote: string | null;
		paymentAmountPeriod: JobPaymentAmountPeriod;
		paymentCurrency: string;
		fuzzyLatitude: { toNumber(): number } | number;
		fuzzyLongitude: { toNumber(): number } | number;
	};
}): z.infer<typeof FeedItemOutputSchema> {
	return {
		jobId: params.job.id,
		title: params.job.title,
		createdAt: params.job.createdAt.toISOString(),
		descriptionSummary: params.job.descriptionSummary,
		payment: {
			type: params.job.paymentType,
			minAmount: params.job.paymentMinAmount === null ? null : _toNumber(params.job.paymentMinAmount),
			maxAmount: params.job.paymentMaxAmount === null ? null : _toNumber(params.job.paymentMaxAmount),
			note: params.job.paymentNote,
			amountPeriod: params.job.paymentAmountPeriod,
			currency: params.job.paymentCurrency,
		},
		location: {
			latitude: _toNumber(params.job.fuzzyLatitude),
			longitude: _toNumber(params.job.fuzzyLongitude),
			areaRadius: JobLocationConstants.AREA_RADIUS_METERS,
		},
	};
}
