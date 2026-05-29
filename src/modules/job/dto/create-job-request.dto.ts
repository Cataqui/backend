import { ApiProperty } from "@nestjs/swagger";
import { Expose, Type } from "class-transformer";
import { IsString, Length, IsOptional, IsEnum, ValidateNested, IsDateString } from "class-validator";
import { CreateJobContactInputDto } from "./create-job-contact-input.dto";
import { CreateJobLocationInputDto } from "./create-job-location-input.dto";
import { CreateJobPaymentInputDto } from "./create-job-payment-input.dto";
import { JobType } from "../../../../generated/prisma/client.js";

export class CreateJobRequestDto {
	@Expose({ name: "title" })
	@ApiProperty({ name: "title", description: "Job title", example: "Help unload truck" })
	@IsString()
	@Length(3, 120)
	readonly title: string;

	@Expose({ name: "description" })
	@ApiProperty({ name: "description", description: "Detailed job description", example: "Need someone to help unload a delivery truck..." })
	@IsString()
	@Length(10, 10000)
	readonly description: string;

	@Expose({ name: "contact" })
	@ApiProperty({ name: "contact", description: "Contact information", type: CreateJobContactInputDto })
	@ValidateNested()
	@Type(() => CreateJobContactInputDto)
	readonly contact: CreateJobContactInputDto;

	@Expose({ name: "location" })
	@ApiProperty({ name: "location", description: "Job location", type: CreateJobLocationInputDto })
	@ValidateNested()
	@Type(() => CreateJobLocationInputDto)
	readonly location: CreateJobLocationInputDto;

	@Expose({ name: "type" })
	@ApiProperty({ name: "type", enum: JobType, description: "Job type", example: "SINGLE" })
	@IsEnum(JobType)
	readonly type: JobType;

	@Expose({ name: "category_id" })
	@ApiProperty({ name: "category_id", description: "Job category ID", example: "cm3x..." })
	@IsString()
	readonly categoryId: string;

	@Expose({ name: "payment" })
	@ApiProperty({ name: "payment", description: "Payment details", type: CreateJobPaymentInputDto })
	@ValidateNested()
	@Type(() => CreateJobPaymentInputDto)
	readonly payment: CreateJobPaymentInputDto;

	@Expose({ name: "expires_at" })
	@ApiProperty({ name: "expires_at", description: "ISO 8601 expiration timestamp (defaults to 30 days)", example: "2026-06-28T00:00:00Z", required: false })
	@IsOptional()
	@IsDateString()
	readonly expiresAt: string | undefined;

	constructor(params: {
		title: string;
		description: string;
		contact: CreateJobContactInputDto;
		location: CreateJobLocationInputDto;
		type: JobType;
		categoryId: string;
		payment: CreateJobPaymentInputDto;
		expiresAt?: string;
	}) {
		this.title = params.title;
		this.description = params.description;
		this.contact = params.contact;
		this.location = params.location;
		this.type = params.type;
		this.categoryId = params.categoryId;
		this.payment = params.payment;
		this.expiresAt = params.expiresAt;
	}
}
