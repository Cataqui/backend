import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import { JobPaymentAmountPeriod, JobPaymentType } from "../../../../generated/prisma/client.js";

export class JobPaymentOutputDto {
	constructor(params: {
		paymentType: JobPaymentType;
		paymentMinAmount: { toNumber(): number } | number | null;
		paymentMaxAmount: { toNumber(): number } | number | null;
		paymentNote: string | null;
		paymentAmountPeriod: JobPaymentAmountPeriod;
		paymentCurrency: string;
	}) {
		this.type = params.paymentType;
		this.minAmount = this._toNullableNumber(params.paymentMinAmount);
		this.maxAmount = this._toNullableNumber(params.paymentMaxAmount);
		this.note = params.paymentNote;
		this.amountPeriod = params.paymentAmountPeriod;
		this.currency = params.paymentCurrency;
	}

	@Expose({ name: "type" })
	@ApiProperty({
		name: "type",
		enum: JobPaymentType,
		description: "Defines if the payment amount is fixed, flexible, etc.",
		example: JobPaymentType.FIXED,
	})
	readonly type: JobPaymentType;

	@Expose({ name: "min_amount" })
	@ApiProperty({
		name: "min_amount",
		description: "Minimum payment amount for the job",
		example: 150.0,
		nullable: true,
	})
	readonly minAmount: number | null;

	@Expose({ name: "max_amount" })
	@ApiProperty({
		name: "max_amount",
		description: "Maximum payment amount for the job (in case of range)",
		example: 200.0,
		nullable: true,
	})
	readonly maxAmount: number | null;

	@Expose({ name: "note" })
	@ApiProperty({
		name: "note",
		description: "A note related to the payment (e.g. how it will be done, or any additional details)",
		example: "Commission-based",
		nullable: true,
	})
	readonly note: string | null;

	@Expose({ name: "amount_period" })
	@ApiProperty({
		name: "amount_period",
		enum: JobPaymentAmountPeriod,
		description:
			"The period of the payment amount, if the payment amount is daily, weekly, monthly, etc. (e.g. $20/day, $100/week, etc.)",
		example: JobPaymentAmountPeriod.SINGLE,
	})
	readonly amountPeriod: JobPaymentAmountPeriod;

	@Expose({ name: "currency" })
	@ApiProperty({ name: "currency", description: "Currency code (ISO 4217)", example: "BRL" })
	readonly currency: string;

	private _toNullableNumber(value: { toNumber(): number } | number | null): number | null {
		if (value === null) return null;

		return typeof value === "number" ? value : value.toNumber();
	}
}
