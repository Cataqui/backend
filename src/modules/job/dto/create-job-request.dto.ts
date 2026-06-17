import { ApiProperty } from "@nestjs/swagger";
import { Expose, Type } from "class-transformer";
import { IsEnum, IsString, IsUUID, Length, ValidateNested } from "class-validator";
import { JobType } from "../../../../generated/prisma/client.js";
import { IsValidJobPayment } from "../decorators/is-valid-job-payment.decorator";
import { CreateJobContactInputDto } from "./create-job-contact-input.dto";
import { CreateJobLocationInputDto } from "./create-job-location-input.dto";
import { JobPaymentInputDto } from "./job-payment-input.dto";

export class CreateJobRequestDto {
	@Expose({ name: "title" })
	@ApiProperty({
		name: "title",
		description: "Short Job title",
		example: "Help unload truck",
		minLength: 3,
		maxLength: 120,
	})
	@IsString()
	@Length(3, 120)
	readonly title!: string;

	@Expose({ name: "description" })
	@ApiProperty({
		name: "description",
		description: "Detailed description about the job",
		example: "Need someone to help unload a delivery truck...",
		maxLength: 10000,
		minLength: 10,
	})
	@IsString()
	@Length(10, 10000)
	readonly description!: string;

	@Expose({ name: "contact" })
	@ApiProperty({
		name: "contact",
		description: "Person to contact regarding the job offer",
		type: CreateJobContactInputDto,
	})
	@ValidateNested()
	@Type(() => CreateJobContactInputDto)
	readonly contact!: CreateJobContactInputDto;

	@Expose({ name: "location" })
	@ApiProperty({ name: "location", description: "Where the job will be executed", type: CreateJobLocationInputDto })
	@ValidateNested()
	@Type(() => CreateJobLocationInputDto)
	readonly location!: CreateJobLocationInputDto;

	@Expose({ name: "type" })
	@ApiProperty({
		name: "type",
		enum: JobType,
		description:
			"Defines if a job is more employment-like (e.g cashier) or individual like (e.g unload a truck, build a wall)",
		example: JobType.INDIVIDUAL,
	})
	@IsEnum(JobType)
	readonly type!: JobType;

	@Expose({ name: "category_id" })
	@ApiProperty({
		name: "category_id",
		description: "The category of the job defined as UUI",
		example: "afdfd9b2-203d-4528-8a1c-82b6b139039b",
	})
	@IsUUID()
	readonly categoryId!: string;

	@Expose({ name: "payment" })
	@ApiProperty({ name: "payment", description: "Details about how the job payment will be", type: JobPaymentInputDto })
	@IsValidJobPayment()
	@ValidateNested()
	@Type(() => JobPaymentInputDto)
	readonly payment!: JobPaymentInputDto;
}
