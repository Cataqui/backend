import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import { JobPaymentRecurrence } from "../../../../generated/prisma/client.js";

export class PaymentOutputDto {
	@Expose({ name: "amount" })
	@ApiProperty({ name: "amount", description: "Payment amount", example: 150.0 })
	readonly amount: number;

	@Expose({ name: "recurrence" })
	@ApiProperty({
		name: "recurrence",
		enum: JobPaymentRecurrence,
		description: "Payment recurrence",
		example: JobPaymentRecurrence.SINGLE,
	})
	readonly recurrence: JobPaymentRecurrence;

	@Expose({ name: "currency" })
	@ApiProperty({ name: "currency", description: "Currency code (ISO 4217)", example: "BRL" })
	readonly currency: string;

	constructor(params: { paymentAmount: { toNumber(): number } | number; paymentRecurrence: JobPaymentRecurrence; paymentCurrency: string }) {
		this.amount = typeof params.paymentAmount === "number" ? params.paymentAmount : params.paymentAmount.toNumber();
		this.recurrence = params.paymentRecurrence;
		this.currency = params.paymentCurrency;
	}
}
