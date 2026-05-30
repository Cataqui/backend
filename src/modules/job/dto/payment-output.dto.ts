import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import { JobPaymentRecurrence, JobPaymentType } from "../../../../generated/prisma/client.js";

export class PaymentOutputDto {
	@Expose({ name: "type" })
	@ApiProperty({ name: "type", enum: JobPaymentType, description: "Payment type", example: JobPaymentType.FIXED })
	readonly type: JobPaymentType;

	@Expose({ name: "min_amount" })
	@ApiProperty({ name: "min_amount", description: "Minimum payment amount", example: 150.0, required: false })
	readonly minAmount: number | undefined;

	@Expose({ name: "max_amount" })
	@ApiProperty({ name: "max_amount", description: "Maximum payment amount", example: 200.0, required: false })
	readonly maxAmount: number | undefined;

	@Expose({ name: "note" })
	@ApiProperty({ name: "note", description: "Payment note", example: "Commission-based", required: false })
	readonly note: string | undefined;

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

	constructor(params: {
		paymentType: JobPaymentType;
		paymentMinAmount: { toNumber(): number } | number | null;
		paymentMaxAmount: { toNumber(): number } | number | null;
		paymentNote: string | null;
		paymentRecurrence: JobPaymentRecurrence;
		paymentCurrency: string;
	}) {
		this.type = params.paymentType;
		this.minAmount = params.paymentMinAmount !== null ? this._toNumber(params.paymentMinAmount) : undefined;
		this.maxAmount = params.paymentMaxAmount !== null ? this._toNumber(params.paymentMaxAmount) : undefined;
		this.note = params.paymentNote ?? undefined;
		this.recurrence = params.paymentRecurrence;
		this.currency = params.paymentCurrency;
	}

	private _toNumber(value: { toNumber(): number } | number): number {
		return typeof value === "number" ? value : value.toNumber();
	}
}
