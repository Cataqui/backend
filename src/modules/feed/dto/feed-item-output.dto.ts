import { ApiProperty, ApiExtraModels } from "@nestjs/swagger";
import { Expose, Type } from "class-transformer";
import { FeedPaymentOutputDto } from "./feed-payment-output.dto";
import { FeedLocationOutputDto } from "./feed-location-output.dto";
import type { JobPaymentAmountPeriod, JobPaymentType } from "../../../../generated/prisma/client.js";

@ApiExtraModels(FeedPaymentOutputDto, FeedLocationOutputDto)
export class FeedItemOutputDto {
	@Expose({ name: "job_id" })
	@ApiProperty({ name: "job_id", description: "Job unique identifier", example: "cm3x..." })
	readonly jobId: string;

	@Expose({ name: "title" })
	@ApiProperty({ name: "title", description: "Job title", example: "Help unload truck" })
	readonly title: string;

	@Expose({ name: "created_at" })
	@ApiProperty({ name: "created_at", description: "ISO 8601 creation timestamp", example: "2026-05-28T10:00:00.000Z" })
	readonly createdAt: string;

	@Expose({ name: "payment" })
	@ApiProperty({ name: "payment", description: "Payment details", type: FeedPaymentOutputDto })
	@Type(() => FeedPaymentOutputDto)
	readonly payment: FeedPaymentOutputDto;

	@Expose({ name: "location" })
	@ApiProperty({ name: "location", description: "Job location", type: FeedLocationOutputDto })
	@Type(() => FeedLocationOutputDto)
	readonly location: FeedLocationOutputDto;

	constructor(params: { jobId: string; title: string; createdAt: string; payment: FeedPaymentOutputDto; location: FeedLocationOutputDto }) {
		this.jobId = params.jobId;
		this.title = params.title;
		this.createdAt = params.createdAt;
		this.payment = params.payment;
		this.location = params.location;
	}

	static fromDatabase(job: {
		id: string;
		title: string;
		createdAt: Date;
		paymentType: JobPaymentType;
		paymentMinAmount: { toNumber(): number } | number | null;
		paymentMaxAmount: { toNumber(): number } | number | null;
		paymentNote: string | null;
		paymentAmountPeriod: JobPaymentAmountPeriod;
		paymentCurrency: string;
		neighborhood: string;
	}): FeedItemOutputDto {
		return new FeedItemOutputDto({
			jobId: job.id,
			title: job.title,
			createdAt: job.createdAt.toISOString(),
			payment: new FeedPaymentOutputDto({
				paymentType: job.paymentType,
				paymentMinAmount: job.paymentMinAmount,
				paymentMaxAmount: job.paymentMaxAmount,
				paymentNote: job.paymentNote,
				paymentAmountPeriod: job.paymentAmountPeriod,
				paymentCurrency: job.paymentCurrency,
			}),
			location: new FeedLocationOutputDto({
				neighborhood: job.neighborhood,
			}),
		});
	}
}
