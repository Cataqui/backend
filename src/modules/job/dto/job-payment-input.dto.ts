import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import { IsNumber, IsPositive, IsEnum, IsOptional, IsString, Length, IsISO4217CurrencyCode } from "class-validator";
import { JobPaymentRecurrence, JobPaymentType } from "../../../../generated/prisma/client.js";

export class JobPaymentInputDto {
	@Expose({ name: "type" })
	@ApiProperty({ name: "type", enum: JobPaymentType, description: "Payment type", example: JobPaymentType.FIXED })
	@IsEnum(JobPaymentType)
	readonly type!: JobPaymentType;

	@Expose({ name: "min_amount" })
	@ApiProperty({ name: "min_amount", description: "Minimum payment amount (required for FIXED and RANGE)", example: 100.0, required: false })
	@IsOptional()
	@IsNumber()
	@IsPositive()
	readonly minAmount?: number;

	@Expose({ name: "max_amount" })
	@ApiProperty({ name: "max_amount", description: "Maximum payment amount (required for RANGE)", example: 200.0, required: false })
	@IsOptional()
	@IsNumber()
	@IsPositive()
	readonly maxAmount?: number;

	@Expose({ name: "note" })
	@ApiProperty({ name: "note", description: "Payment note (required for OTHER)", example: "Commission-based, percentage of sales", required: false })
	@IsOptional()
	@IsString()
	@Length(1, 500)
	readonly note?: string;

	@Expose({ name: "recurrence" })
	@ApiProperty({
		name: "recurrence",
		enum: JobPaymentRecurrence,
		description: "Payment recurrence",
		example: JobPaymentRecurrence.DAILY,
	})
	@IsEnum(JobPaymentRecurrence)
	readonly recurrence!: JobPaymentRecurrence;

	@Expose({ name: "currency" })
	@ApiProperty({ name: "currency", description: "Currency code (ISO 4217)", example: "BRL" })
	@IsISO4217CurrencyCode()
	readonly currency!: string;
}
