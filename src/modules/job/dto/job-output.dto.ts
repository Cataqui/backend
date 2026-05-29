import { ApiProperty, ApiExtraModels } from "@nestjs/swagger";
import { Expose, Type } from "class-transformer";
import { JobContactOutputDto } from "./job-contact-output.dto";
import { JobLocationOutputDto } from "./job-location-output.dto";
import { JobCategoryOutputDto } from "./job-category-output.dto";
import { PaymentOutputDto } from "./payment-output.dto";
import { JobStatus, JobType, Prisma } from "../../../../generated/prisma/client.js";

@ApiExtraModels(JobContactOutputDto, JobLocationOutputDto, JobCategoryOutputDto, PaymentOutputDto)
export class JobOutputDto {
	@Expose({ name: "job_id" })
	@ApiProperty({ name: "job_id", description: "Job unique identifier", example: "cm3x..." })
	readonly jobId: string;

	@Expose({ name: "title" })
	@ApiProperty({ name: "title", description: "Job title", example: "Help unload truck" })
	readonly title: string;

	@Expose({ name: "description" })
	@ApiProperty({ name: "description", description: "Detailed job description", example: "Need someone to help unload a delivery truck..." })
	readonly description: string;

	@Expose({ name: "contact" })
	@ApiProperty({ name: "contact", description: "Contact information", type: JobContactOutputDto })
	@Type(() => JobContactOutputDto)
	readonly contact: JobContactOutputDto;

	@Expose({ name: "location" })
	@ApiProperty({ name: "location", description: "Job location", type: JobLocationOutputDto })
	@Type(() => JobLocationOutputDto)
	readonly location: JobLocationOutputDto;

	@Expose({ name: "category" })
	@ApiProperty({ name: "category", description: "Job category", type: JobCategoryOutputDto })
	@Type(() => JobCategoryOutputDto)
	readonly category: JobCategoryOutputDto;

	@Expose({ name: "payment" })
	@ApiProperty({ name: "payment", description: "Payment details", type: PaymentOutputDto })
	@Type(() => PaymentOutputDto)
	readonly payment: PaymentOutputDto;

	@Expose({ name: "status" })
	@ApiProperty({ name: "status", enum: JobStatus, description: "Job status", example: JobStatus.ACTIVE })
	readonly status: JobStatus;

	@Expose({ name: "type" })
	@ApiProperty({ name: "type", enum: JobType, description: "Job type", example: JobType.SINGLE })
	readonly type: JobType;

	@Expose({ name: "expires_at" })
	@ApiProperty({ name: "expires_at", description: "ISO 8601 expiration timestamp", example: "2026-06-28T00:00:00.000Z" })
	readonly expiresAt: string;

	@Expose({ name: "created_at" })
	@ApiProperty({ name: "created_at", description: "ISO 8601 creation timestamp", example: "2026-05-28T10:00:00.000Z" })
	readonly createdAt: string;

	@Expose({ name: "updated_at" })
	@ApiProperty({ name: "updated_at", description: "ISO 8601 last update timestamp", example: "2026-05-28T10:00:00.000Z" })
	readonly updatedAt: string;

	constructor(params: {
		jobId: string;
		title: string;
		description: string;
		contact: JobContactOutputDto;
		location: JobLocationOutputDto;
		category: JobCategoryOutputDto;
		payment: PaymentOutputDto;
		status: JobStatus;
		type: JobType;
		expiresAt: string;
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
		this.expiresAt = params.expiresAt;
		this.createdAt = params.createdAt;
		this.updatedAt = params.updatedAt;
	}

	static fromDatabase(job: Prisma.JobGetPayload<{ include: { category: true } }>, categoryDisplayName: string): JobOutputDto {
		return new JobOutputDto({
			jobId: job.id,
			title: job.title,
			description: job.description,
			contact: new JobContactOutputDto({ contactName: job.contactName, contactWhatsapp: job.contactWhatsapp }),
			location: new JobLocationOutputDto({ street: job.street, neighborhood: job.neighborhood, city: job.city, state: job.state, country: job.country }),
			category: new JobCategoryOutputDto({ categoryId: job.category.id, name: categoryDisplayName, slug: job.category.slug }),
			payment: new PaymentOutputDto({ paymentAmount: job.paymentAmount, paymentRecurrence: job.paymentRecurrence, paymentCurrency: job.paymentCurrency }),
			status: job.status,
			type: job.type,
			expiresAt: job.expiresAt.toISOString(),
			createdAt: job.createdAt.toISOString(),
			updatedAt: job.updatedAt.toISOString(),
		});
	}
}
