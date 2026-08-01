import { ApiExtraModels, ApiProperty } from "@nestjs/swagger";
import { Expose, Type } from "class-transformer";
import { JobStatus, JobType, Prisma } from "../../../../generated/prisma/client.js";
import { JobPaymentOutputDto } from "../../../shared/dto/job/job-payment-output.dto";
import { RequiredToPublish } from "../decorators/required-to-publish.decorator";
import { JobContactReferenceOutputDto } from "./job-contact-reference-output.dto";
import { JobLocationOutputDto } from "./job-location-output.dto";

@ApiExtraModels(JobContactReferenceOutputDto, JobLocationOutputDto, JobPaymentOutputDto)
export class JobOutputDto {
	constructor(params: {
		jobId: string;
		title: string | null;
		description: string;
		descriptionSummary: string | null;
		contactReference: JobContactReferenceOutputDto | null;
		location: JobLocationOutputDto | null;
		payment: JobPaymentOutputDto | null;
		status: JobStatus;
		type: JobType | null;
		createdAt: string;
		updatedAt: string;
	}) {
		this.jobId = params.jobId;
		this.title = params.title;
		this.description = params.description;
		this.descriptionSummary = params.descriptionSummary;
		this.contactReference = params.contactReference;
		this.location = params.location;
		this.payment = params.payment;
		this.status = params.status;
		this.type = params.type;
		this.createdAt = params.createdAt;
		this.updatedAt = params.updatedAt;
	}

	static fromDatabase(job: Prisma.JobGetPayload<{ include: { contact: true } }>): JobOutputDto {
		const {
			neighborhood,
			city,
			state,
			country,
			fuzzyLatitude,
			fuzzyLongitude,
			paymentType,
			paymentAmountPeriod,
			paymentCurrency,
		} = job;

		const hasCompleteLocation =
			neighborhood !== null &&
			city !== null &&
			state !== null &&
			country !== null &&
			fuzzyLatitude !== null &&
			fuzzyLongitude !== null;

		const hasCompletePayment = paymentType !== null && paymentAmountPeriod !== null && paymentCurrency !== null;

		return new JobOutputDto({
			jobId: job.id,
			title: job.title,
			description: job.description,
			descriptionSummary: job.descriptionSummary,
			contactReference:
				job.contact === null
					? null
					: JobContactReferenceOutputDto.fromDatabase({
							id: job.contact.id,
							contactMethod: job.contact.contactMethod,
						}),
			location: hasCompleteLocation
				? new JobLocationOutputDto({
						neighborhood: neighborhood,
						city: city,
						state: state,
						country: country,
						latitude: fuzzyLatitude,
						longitude: fuzzyLongitude,
					})
				: null,
			payment: hasCompletePayment
				? new JobPaymentOutputDto({
						paymentType: paymentType,
						paymentMinAmount: job.paymentMinAmount,
						paymentMaxAmount: job.paymentMaxAmount,
						paymentNote: job.paymentNote,
						paymentAmountPeriod: paymentAmountPeriod,
						paymentCurrency: paymentCurrency,
					})
				: null,
			status: job.status,
			type: job.type,
			createdAt: job.createdAt.toISOString(),
			updatedAt: job.updatedAt.toISOString(),
		});
	}

	@Expose({ name: "job_id" })
	@ApiProperty({ name: "job_id", description: "Job unique identifier", format: "uuid" })
	readonly jobId: string;

	@Expose({ name: "title" })
	@ApiProperty({ name: "title", nullable: true, description: "Short job title", example: "Help unload truck" })
	readonly title: string | null;

	@Expose({ name: "description" })
	@ApiProperty({
		name: "description",
		description: "Detailed description about the job",
		example: "Need someone to help unload a delivery truck...",
	})
	readonly description: string;

	@Expose({ name: "description_summary" })
	@ApiProperty({
		name: "description_summary",
		nullable: true,
		description: "Worker-focused feed summary generated from the description",
		example: "Paid moving help available today",
	})
	readonly descriptionSummary: string | null;

	@Expose({ name: "contact_reference" })
	@ApiProperty({
		name: "contact_reference",
		nullable: true,
		description: "Reference to the job contact, or null until supplied on a draft",
		type: JobContactReferenceOutputDto,
	})
	@Type(() => JobContactReferenceOutputDto)
	@RequiredToPublish({ publicFieldName: "contact" })
	readonly contactReference: JobContactReferenceOutputDto | null;

	@Expose({ name: "location" })
	@ApiProperty({
		name: "location",
		nullable: true,
		description: "Where the job will be executed, or null until supplied on a draft",
		type: JobLocationOutputDto,
	})
	@Type(() => JobLocationOutputDto)
	@RequiredToPublish()
	readonly location: JobLocationOutputDto | null;

	@Expose({ name: "payment" })
	@ApiProperty({
		name: "payment",
		nullable: true,
		description: "Job payment details, or null until supplied on a draft",
		type: JobPaymentOutputDto,
	})
	@Type(() => JobPaymentOutputDto)
	@RequiredToPublish()
	readonly payment: JobPaymentOutputDto | null;

	@Expose({ name: "status" })
	@ApiProperty({
		name: "status",
		enum: JobStatus,
		description: "Job lifecycle status; DRAFT responses may contain nullable fields",
		example: JobStatus.ACTIVE,
	})
	readonly status: JobStatus;

	@Expose({ name: "type" })
	@ApiProperty({
		name: "type",
		enum: JobType,
		nullable: true,
		description: "Job engagement type, or null until supplied on a draft",
		example: JobType.INDIVIDUAL,
	})
	@RequiredToPublish()
	readonly type: JobType | null;

	@Expose({ name: "created_at" })
	@ApiProperty({ name: "created_at", description: "ISO 8601 timestamp of job creation" })
	readonly createdAt: string;

	@Expose({ name: "updated_at" })
	@ApiProperty({ name: "updated_at", description: "ISO 8601 timestamp of last job update" })
	readonly updatedAt: string;
}
