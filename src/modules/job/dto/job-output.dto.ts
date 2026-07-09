import { ApiExtraModels, ApiProperty } from "@nestjs/swagger";
import { Expose, Type } from "class-transformer";
import { JobStatus, JobType, Prisma } from "../../../../generated/prisma/client.js";
import { JobPaymentOutputDto } from "../../../shared/dto/job/job-payment-output.dto";
import { MapConfigOutputDto } from "../../map/dto/map-config-output.dto";
import { JobCategoryOutputDto } from "./job-category-output.dto";
import { JobContactReferenceOutputDto } from "./job-contact-reference-output.dto";
import { JobLocationOutputDto } from "./job-location-output.dto";

@ApiExtraModels(JobContactReferenceOutputDto, JobLocationOutputDto, JobCategoryOutputDto, JobPaymentOutputDto)
export class JobOutputDto {
	static fromDatabase(
		job: Prisma.JobGetPayload<{ include: { category: true; contact: true } }>,
		categoryDisplayName: string,
		mapConfig: MapConfigOutputDto,
	): JobOutputDto {
		return new JobOutputDto({
			jobId: job.id,
			title: job.title,
			description: job.description,
			contactReference: JobContactReferenceOutputDto.fromDatabase({
				id: job.contact!.id,
				contactMethod: job.contact!.contactMethod,
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

	@Expose({ name: "contact_reference" })
	@ApiProperty({
		name: "contact_reference",
		description: "Reference to the job contact",
		type: JobContactReferenceOutputDto,
	})
	@Type(() => JobContactReferenceOutputDto)
	readonly contactReference: JobContactReferenceOutputDto;

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
		contactReference: JobContactReferenceOutputDto;
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
		this.contactReference = params.contactReference;
		this.location = params.location;
		this.category = params.category;
		this.payment = params.payment;
		this.status = params.status;
		this.type = params.type;
		this.createdAt = params.createdAt;
		this.updatedAt = params.updatedAt;
	}
}
