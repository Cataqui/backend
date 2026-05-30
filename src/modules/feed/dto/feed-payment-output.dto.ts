import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import { JobPaymentAmountPeriod, JobPaymentType } from "../../../../generated/prisma/client.js";

export class FeedPaymentOutputDto {
	@Expose({ name: "type" })
	@ApiProperty({
		name: "type",
		enum: JobPaymentType,
		description: "Defines if the job payment amount for the worker is fixed, range based on expertise, totally flexible or other",
		example: JobPaymentType.FIXED,
	})
	readonly type: JobPaymentType;

	@Expose({ name: "min_amount" })
	@ApiProperty({ name: "min_amount", description: "Minimum payment amount that the worker will receive. Omitted in case of flexible", example: 150.0, required: false })
	readonly minAmount: number | undefined;

	@Expose({ name: "max_amount" })
	@ApiProperty({ name: "max_amount", description: "Maximum payment amount that the worker will receive. Omitted in case of flexible", example: 200.0, required: false })
	readonly maxAmount: number | undefined;

	@Expose({ name: "note" })
	@ApiProperty({
		name: "note",
		description: "A note explaining how the payment works. Required if payment type is `OTHER`",
		example: "Commission-based",
		required: false,
	})
	readonly note: string | undefined;

	@Expose({ name: "amount_period" })
	@ApiProperty({
		name: "amount_period",
		enum: JobPaymentAmountPeriod,
		description: "Define if a payment is single time or recurring (and recurrency period if recurring)",
		example: JobPaymentAmountPeriod.SINGLE,
	})
	readonly amountPeriod: JobPaymentAmountPeriod;

	@Expose({ name: "currency" })
	@ApiProperty({ name: "currency", description: "Payment currency code (ISO 4217)", example: "BRL" })
	readonly currency: string;

	constructor(params: {
		paymentType: JobPaymentType;
		paymentMinAmount: { toNumber(): number } | number | null;
		paymentMaxAmount: { toNumber(): number } | number | null;
		paymentNote: string | null;
		paymentAmountPeriod: JobPaymentAmountPeriod;
		paymentCurrency: string;
	}) {
		this.type = params.paymentType;
		this.minAmount = params.paymentMinAmount !== null ? this._toNumber(params.paymentMinAmount) : undefined;
		this.maxAmount = params.paymentMaxAmount !== null ? this._toNumber(params.paymentMaxAmount) : undefined;
		this.note = params.paymentNote ?? undefined;
		this.amountPeriod = params.paymentAmountPeriod;
		this.currency = params.paymentCurrency;
	}

	private _toNumber(value: { toNumber(): number } | number): number {
		return typeof value === "number" ? value : value.toNumber();
	}
}
