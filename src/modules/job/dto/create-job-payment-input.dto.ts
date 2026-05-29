import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import { IsNumber, IsPositive, IsEnum, IsISO4217CurrencyCode } from "class-validator";
import { JobPaymentRecurrence } from "../../../../generated/prisma/client.js";

export class CreateJobPaymentInputDto {
	@Expose({ name: "amount" })
	@ApiProperty({ name: "amount", description: "Payment amount", example: 150.0 })
	@IsNumber()
	@IsPositive()
	readonly amount!: number;

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
