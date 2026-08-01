import { ApiExtraModels, ApiProperty } from "@nestjs/swagger";
import { Expose, Type } from "class-transformer";
import type { JobPaymentAmountPeriod, JobPaymentType } from "../../../../generated/prisma/client.js";
import { JobPaymentOutputDto } from "../../../shared/dto/job/job-payment-output.dto";
import { MapConfigOutputDto } from "../../map/dto/map-config-output.dto";
import { FeedLocationOutputDto } from "./feed-location-output.dto";

@ApiExtraModels(JobPaymentOutputDto, FeedLocationOutputDto, MapConfigOutputDto)
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

	@Expose({ name: "description_summary" })
	@ApiProperty({
		name: "description_summary",
		description: "Short worker-focused pitch with the most decision-useful grounded details from the post",
		example: "Sem experiência, com treinamento e três opções de turno de 6 horas",
	})
	readonly descriptionSummary: string;

	@Expose({ name: "payment" })
	@ApiProperty({ name: "payment", description: "Payment details", type: JobPaymentOutputDto })
	@Type(() => JobPaymentOutputDto)
	readonly payment: JobPaymentOutputDto;

	@Expose({ name: "location" })
	@ApiProperty({ name: "location", description: "Job location", type: FeedLocationOutputDto })
	@Type(() => FeedLocationOutputDto)
	readonly location: FeedLocationOutputDto;

	constructor(params: {
		jobId: string;
		title: string;
		createdAt: string;
		descriptionSummary: string;
		payment: JobPaymentOutputDto;
		location: FeedLocationOutputDto;
	}) {
		this.jobId = params.jobId;
		this.title = params.title;
		this.createdAt = params.createdAt;
		this.descriptionSummary = params.descriptionSummary;
		this.payment = params.payment;
		this.location = params.location;
	}

	static fromDatabase(
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
			neighborhood: string;
			fuzzyLatitude: { toNumber(): number } | number;
			fuzzyLongitude: { toNumber(): number } | number;
		},
		mapConfig: MapConfigOutputDto,
	): FeedItemOutputDto {
		return new FeedItemOutputDto({
			jobId: job.id,
			title: job.title,
			createdAt: job.createdAt.toISOString(),
			descriptionSummary: job.descriptionSummary,
			payment: new JobPaymentOutputDto({
				paymentType: job.paymentType,
				paymentMinAmount: job.paymentMinAmount,
				paymentMaxAmount: job.paymentMaxAmount,
				paymentNote: job.paymentNote,
				paymentAmountPeriod: job.paymentAmountPeriod,
				paymentCurrency: job.paymentCurrency,
			}),
			location: new FeedLocationOutputDto({
				neighborhood: job.neighborhood,
				latitude: job.fuzzyLatitude,
				longitude: job.fuzzyLongitude,
				mapConfig,
			}),
		});
	}
}
