import { ApiExtraModels, ApiProperty } from "@nestjs/swagger";
import { Expose, Type } from "class-transformer";
import { JobStatus, JobType, Prisma } from "../../../../generated/prisma/client.js";
import { JobPaymentOutputDto } from "../../../shared/dto/job/job-payment-output.dto";
import { MapConfigOutputDto } from "../../map/dto/map-config-output.dto";
import { JobCategoryOutputDto } from "./job-category-output.dto";
import { JobContactOutputDto } from "./job-contact-output.dto";
import { JobLocationOutputDto } from "./job-location-output.dto";

@ApiExtraModels(JobContactOutputDto, JobLocationOutputDto, JobCategoryOutputDto, JobPaymentOutputDto)
export class JobOutputDto {
	@Expose({ name: "job_id" })
	@ApiProperty({ name: "job_id", description: "Job unique identifier", example: "cm3x..." })
	readonly jobId: string;

	@Expose({ name: "title" })
	@ApiProperty({ name: "title", description: "Short Job title", example: "Help unload truck" })
	readonly title: string;

	@Expose({ name: "description" })
	@ApiProperty({
		name: "description",
		description: "Detailed description about the job",
		example: "Need someone to help unload a delivery truck...",
	})
	readonly description: string;

	@Expose({ name: "contact" })
	@ApiProperty({ name: "contact", description: "Person to contact regarding the job offer", type: JobContactOutputDto })
	@Type(() => JobContactOutputDto)
	readonly contact: JobContactOutputDto;

	@Expose({ name: "location" })
	@ApiProperty({ name: "location", description: "Where the job will be executed", type: JobLocationOutputDto })
	@Type(() => JobLocationOutputDto)
	readonly location: JobLocationOutputDto;

	@Expose({ name: "category" })
	@ApiProperty({ name: "category", description: "The category of the job defined as UUID", type: JobCategoryOutputDto })
	@Type(() => JobCategoryOutputDto)
	readonly category: JobCategoryOutputDto;

	@Expose({ name: "payment" })
	@ApiProperty({ name: "payment", description: "Details about how the job payment will be", type: JobPaymentOutputDto })
	@Type(() => JobPaymentOutputDto)
	readonly payment: JobPaymentOutputDto;

	@Expose({ name: "status" })
	@ApiProperty({
		name: "status",
		enum: JobStatus,
		description: "Define if a job accepts new proposals",
		example: JobStatus.ACTIVE,
	})
	readonly status: JobStatus;

	@Expose({ name: "type" })
	@ApiProperty({
		name: "type",
		enum: JobType,
		description:
			"Defines if a job is more employment-like (e.g cashier) or individual like (e.g unload a truck, build a wall)",
		example: JobType.INDIVIDUAL,
	})
	readonly type: JobType;

	@Expose({ name: "created_at" })
	@ApiProperty({
		name: "created_at",
		description: "ISO 8601 timestamp of job creation",
		example: "2026-05-28T10:00:00.000Z",
	})
	readonly createdAt: string;

	@Expose({ name: "updated_at" })
	@ApiProperty({
		name: "updated_at",
		description: "ISO 8601 timestamp of last job update",
		example: "2026-05-28T10:00:00.000Z",
	})
	readonly updatedAt: string;

	constructor(params: {
		jobId: string;
		title: string;
		description: string;
		contact: JobContactOutputDto;
		location: JobLocationOutputDto;
		category: JobCategoryOutputDto;
		payment: JobPaymentOutputDto;
		status: JobStatus;
		type: JobType;
		createdAt: string;
		updatedAt: string;
	}) {
		this.jobId = params.jobId;
		this.title = params.title;
		this.description = params.description;
		this.contact = params.contact;
		this.location = params.location;
		this.category = params.category;
		this.payment = params.payment;
		this.status = params.status;
		this.type = params.type;
		this.createdAt = params.createdAt;
		this.updatedAt = params.updatedAt;
	}

	static fromDatabase(
		job: Prisma.JobGetPayload<{ include: { category: true } }>,
		categoryDisplayName: string,
		mapConfig: MapConfigOutputDto,
	): JobOutputDto {
		return new JobOutputDto({
			jobId: job.id,
			title: job.title,
			description: job.description,
			contact: new JobContactOutputDto({
				contactPhoneNumber: job.contactPhoneNumber,
				contactMethod: job.contactMethod,
			}),
			location: new JobLocationOutputDto({
				neighborhood: job.neighborhood,
				city: job.city,
				state: job.state,
				country: job.country,
				latitude: job.fuzzyLatitude,
				longitude: job.fuzzyLongitude,
				mapConfig,
			}),
			category: new JobCategoryOutputDto({
				categoryId: job.category.id,
				name: categoryDisplayName,
				slug: job.category.slug,
			}),
			payment: new JobPaymentOutputDto({
				paymentType: job.paymentType,
				paymentMinAmount: job.paymentMinAmount,
				paymentMaxAmount: job.paymentMaxAmount,
				paymentNote: job.paymentNote,
				paymentAmountPeriod: job.paymentAmountPeriod,
				paymentCurrency: job.paymentCurrency,
			}),
			status: job.status,
			type: job.type,
			createdAt: job.createdAt.toISOString(),
			updatedAt: job.updatedAt.toISOString(),
		});
	}
}
