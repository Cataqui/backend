import { ApiProperty } from "@nestjs/swagger";
import { Expose, Type } from "class-transformer";
import { IsString, Length, IsEnum, ValidateNested, IsUUID } from "class-validator";
import { CreateJobContactInputDto } from "./create-job-contact-input.dto";
import { CreateJobLocationInputDto } from "./create-job-location-input.dto";
import { JobPaymentInputDto } from "./job-payment-input.dto";
import { IsValidJobPayment } from "../decorators/is-valid-job-payment.decorator";
import { JobType } from "../../../../generated/prisma/client.js";

export class CreateJobRequestDto {
	@Expose({ name: "title" })
	@ApiProperty({ name: "title", description: "Job title", example: "Help unload truck" })
	@IsString()
	@Length(3, 120)
	readonly title!: string;

	@Expose({ name: "description" })
	@ApiProperty({ name: "description", description: "Detailed job description", example: "Need someone to help unload a delivery truck..." })
	@IsString()
	@Length(10, 10000)
	readonly description!: string;

	@Expose({ name: "contact" })
	@ApiProperty({ name: "contact", description: "Contact information", type: CreateJobContactInputDto })
	@ValidateNested()
	@Type(() => CreateJobContactInputDto)
	readonly contact!: CreateJobContactInputDto;

	@Expose({ name: "location" })
	@ApiProperty({ name: "location", description: "Job location", type: CreateJobLocationInputDto })
	@ValidateNested()
	@Type(() => CreateJobLocationInputDto)
	readonly location!: CreateJobLocationInputDto;

	@Expose({ name: "type" })
	@ApiProperty({ name: "type", enum: JobType, description: "Job type", example: JobType.TASK })
	@IsEnum(JobType)
	readonly type!: JobType;

	@Expose({ name: "category_id" })
	@ApiProperty({ name: "category_id", description: "Job category UUID", example: "afdfd9b2-203d-4528-8a1c-82b6b139039b" })
	@IsUUID()
	readonly categoryId!: string;

	@Expose({ name: "payment" })
	@ApiProperty({ name: "payment", description: "Payment details", type: JobPaymentInputDto })
	@IsValidJobPayment()
	@ValidateNested()
	@Type(() => JobPaymentInputDto)
	readonly payment!: JobPaymentInputDto;
}
