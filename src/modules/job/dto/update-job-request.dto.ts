import { ApiPropertyOptional } from "@nestjs/swagger";
import { Expose, Type } from "class-transformer";
import { IsEnum, IsOptional, IsString, Length, ValidateNested } from "class-validator";
import { JobType } from "../../../../generated/prisma/client.js";
import { IsValidContactInput } from "../decorators/is-valid-contact-input.decorator";
import { IsValidJobPayment } from "../decorators/is-valid-job-payment.decorator";
import { JobContactInputDto } from "./job-contact-input.dto";
import { JobLocationInputDto } from "./job-location-input.dto";
import { JobPaymentInputDto } from "./job-payment-input.dto";

export class UpdateJobRequestDto {
	@Expose({ name: "description" })
	@ApiPropertyOptional({
		name: "description",
		description: "The new job description",
		example: "Need someone to help unload a delivery truck...",
		maxLength: 10000,
		minLength: 10,
	})
	@IsOptional()
	@IsString()
	@Length(10, 10000)
	readonly description?: string;

	@Expose({ name: "contact" })
	@ApiPropertyOptional({
		name: "contact",
		description: "The updated person to contact regarding the job offer",
		type: JobContactInputDto,
	})
	@IsOptional()
	@IsValidContactInput()
	@ValidateNested()
	@Type(() => JobContactInputDto)
	readonly contact?: JobContactInputDto;

	@Expose({ name: "location" })
	@ApiPropertyOptional({
		name: "location",
		description: "The updated place where the job will be executed",
		type: JobLocationInputDto,
	})
	@IsOptional()
	@ValidateNested()
	@Type(() => JobLocationInputDto)
	readonly location?: JobLocationInputDto;

	@Expose({ name: "type" })
	@ApiPropertyOptional({
		name: "type",
		enum: JobType,
		description: "The updated type of opportunity: employment-like, contract work, or an individual task",
		example: JobType.INDIVIDUAL,
	})
	@IsOptional()
	@IsEnum(JobType)
	readonly type?: JobType;

	@Expose({ name: "payment" })
	@ApiPropertyOptional({
		name: "payment",
		description: "The updated payment details",
		type: JobPaymentInputDto,
	})
	@IsOptional()
	@IsValidJobPayment()
	@ValidateNested()
	@Type(() => JobPaymentInputDto)
	readonly payment?: JobPaymentInputDto;
}
