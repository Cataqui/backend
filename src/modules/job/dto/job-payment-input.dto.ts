import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import { IsNumber, IsPositive, IsEnum, IsOptional, IsString, Length, IsISO4217CurrencyCode } from "class-validator";
import { JobPaymentAmountPeriod, JobPaymentType } from "../../../../generated/prisma/client.js";

export class JobPaymentInputDto {
	@Expose({ name: "type" })
	@ApiProperty({
		name: "type",
		enum: JobPaymentType,
		description: "Defines the type of payment that the worker will receive for the job upon completion",
		example: JobPaymentType.FIXED,
	})
	@IsEnum(JobPaymentType)
	readonly type!: JobPaymentType;

	@Expose({ name: "min_amount" })
	@ApiProperty({
		name: "min_amount",
		description: "Minimum payment amount for the job offer (required for FIXED and RANGE)",
		example: 100.0,
		required: false,
	})
	@IsOptional()
	@IsNumber()
	@IsPositive()
	readonly minAmount?: number;

	@Expose({ name: "max_amount" })
	@ApiProperty({
		name: "max_amount",
		description: "Maximum payment amount for the job offer (required for RANGE)",
		example: 200.0,
		required: false,
	})
	@IsOptional()
	@IsNumber()
	@IsPositive()
	readonly maxAmount?: number;

	@Expose({ name: "note" })
	@ApiProperty({
		name: "note",
		description: "Note related to the payment, e.g. how it will be done, or any additional details (required when type is OTHER)",
		example: "Commission-based, percentage of sales",
		required: false,
		maxLength: 500,
		minLength: 1,
	})
	@IsOptional()
	@IsString()
	@Length(1, 500)
	readonly note?: string;

	@Expose({ name: "amount_period" })
	@ApiProperty({
		name: "amount_period",
		enum: JobPaymentAmountPeriod,
		description: "The period of the payment amount, e.g. if the payment amount is daily, weekly, monthly, etc. (e.g. $20/day, $100/week, etc.)",
		example: JobPaymentAmountPeriod.DAILY,
		required: true,
	})
	@IsEnum(JobPaymentAmountPeriod)
	readonly amountPeriod!: JobPaymentAmountPeriod;

	@Expose({ name: "currency" })
	@ApiProperty({ name: "currency", description: "Currency code (ISO 4217)", example: "BRL" })
	@IsISO4217CurrencyCode()
	readonly currency!: string;
}
