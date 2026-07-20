import { JobPaymentType } from "../../../../generated/prisma/client.js";
import { IsValidJobPaymentConstraint } from "./is-valid-job-payment.decorator";

function createDefaultMessageArgs(payment: {
	type: JobPaymentType;
	minAmount?: number | null;
	maxAmount?: number | null;
	note?: string | null;
}) {
	return {
		object: {},
		property: "payment",
		targetName: "CreateJobRequestDto",
		value: payment,
		constraints: [],
	};
}

describe("IsValidJobPaymentConstraint", () => {
	let constraint: IsValidJobPaymentConstraint;

	beforeEach(() => {
		constraint = new IsValidJobPaymentConstraint();
	});

	describe("FIXED", () => {
		it("should pass when minAmount is set and maxAmount is not set", () => {
			expect(constraint.validate({ type: JobPaymentType.FIXED, minAmount: 150.0 })).toBe(true);
		});

		it("should fail when minAmount is missing", () => {
			expect(constraint.validate({ type: JobPaymentType.FIXED })).toBe(false);
		});

		it("should return message when minAmount is missing", () => {
			const msg = constraint.defaultMessage(createDefaultMessageArgs({ type: JobPaymentType.FIXED }));

			expect(msg).toBe("Fixed payment requires a minimum amount");
		});

		it("should fail when maxAmount is set", () => {
			expect(constraint.validate({ type: JobPaymentType.FIXED, minAmount: 150.0, maxAmount: 200.0 })).toBe(false);
		});

		it("should return message when maxAmount is set", () => {
			const msg = constraint.defaultMessage(
				createDefaultMessageArgs({ type: JobPaymentType.FIXED, minAmount: 100.0, maxAmount: 200.0 }),
			);

			expect(msg).toBe("Fixed payment must not have a maximum amount");
		});

		it("should fail when minAmount is explicitly null", () => {
			expect(constraint.validate({ type: JobPaymentType.FIXED, minAmount: null })).toBe(false);
		});

		it("should return message when minAmount is explicitly null", () => {
			const msg = constraint.defaultMessage(createDefaultMessageArgs({ type: JobPaymentType.FIXED, minAmount: null }));

			expect(msg).toBe("Fixed payment requires a minimum amount");
		});

		it("should pass when maxAmount is explicitly null", () => {
			expect(constraint.validate({ type: JobPaymentType.FIXED, minAmount: 150.0, maxAmount: null })).toBe(true);
		});
	});

	describe("RANGE", () => {
		it("should pass when both amounts are set and max > min", () => {
			expect(constraint.validate({ type: JobPaymentType.RANGE, minAmount: 100.0, maxAmount: 200.0 })).toBe(true);
		});

		it("should fail when minAmount is missing", () => {
			expect(constraint.validate({ type: JobPaymentType.RANGE, maxAmount: 200.0 })).toBe(false);
		});

		it("should return message when minAmount is missing", () => {
			const msg = constraint.defaultMessage(createDefaultMessageArgs({ type: JobPaymentType.RANGE, maxAmount: 200.0 }));

			expect(msg).toBe("Range payment requires a minimum and maximum amount");
		});

		it("should fail when maxAmount is missing", () => {
			expect(constraint.validate({ type: JobPaymentType.RANGE, minAmount: 100.0 })).toBe(false);
		});

		it("should return message when maxAmount is missing", () => {
			const msg = constraint.defaultMessage(createDefaultMessageArgs({ type: JobPaymentType.RANGE, minAmount: 100.0 }));

			expect(msg).toBe("Range payment requires a minimum and maximum amount");
		});

		it("should fail when maxAmount <= minAmount", () => {
			expect(constraint.validate({ type: JobPaymentType.RANGE, minAmount: 200.0, maxAmount: 100.0 })).toBe(false);
		});

		it("should return message when maxAmount <= minAmount", () => {
			const msg = constraint.defaultMessage(
				createDefaultMessageArgs({ type: JobPaymentType.RANGE, minAmount: 200.0, maxAmount: 100.0 }),
			);

			expect(msg).toBe("Maximum amount must be greater than the minimum amount");
		});

		it("should fail when minAmount is explicitly null", () => {
			expect(constraint.validate({ type: JobPaymentType.RANGE, minAmount: null, maxAmount: 200.0 })).toBe(false);
		});

		it("should fail when maxAmount is explicitly null", () => {
			expect(constraint.validate({ type: JobPaymentType.RANGE, minAmount: 100.0, maxAmount: null })).toBe(false);
		});
	});

	describe("FLEXIBLE", () => {
		it("should pass when neither amount is set", () => {
			expect(constraint.validate({ type: JobPaymentType.FLEXIBLE })).toBe(true);
		});

		it("should fail when minAmount is set", () => {
			expect(constraint.validate({ type: JobPaymentType.FLEXIBLE, minAmount: 100.0 })).toBe(false);
		});

		it("should return message when amounts are set", () => {
			const msg = constraint.defaultMessage(
				createDefaultMessageArgs({ type: JobPaymentType.FLEXIBLE, minAmount: 100.0 }),
			);

			expect(msg).toBe("Flexible payment must not have amount values");
		});

		it("should pass when minAmount is explicitly null", () => {
			expect(constraint.validate({ type: JobPaymentType.FLEXIBLE, minAmount: null })).toBe(true);
		});

		it("should pass when maxAmount is explicitly null", () => {
			expect(constraint.validate({ type: JobPaymentType.FLEXIBLE, maxAmount: null })).toBe(true);
		});
	});

	describe("OTHER", () => {
		it("should pass when note is set and amounts are not", () => {
			expect(constraint.validate({ type: JobPaymentType.OTHER, note: "Commission-based" })).toBe(true);
		});

		it("should fail when note is missing", () => {
			expect(constraint.validate({ type: JobPaymentType.OTHER })).toBe(false);
		});

		it("should return message when note is missing", () => {
			const msg = constraint.defaultMessage(createDefaultMessageArgs({ type: JobPaymentType.OTHER }));

			expect(msg).toBe("Other payment type requires a note explaining the payment");
		});

		it("should fail when note is empty string", () => {
			expect(constraint.validate({ type: JobPaymentType.OTHER, note: "" })).toBe(false);
		});

		it("should return message when note is empty", () => {
			const msg = constraint.defaultMessage(createDefaultMessageArgs({ type: JobPaymentType.OTHER, note: "" }));

			expect(msg).toBe("Other payment type requires a note explaining the payment");
		});

		it("should fail when amounts are set", () => {
			expect(constraint.validate({ type: JobPaymentType.OTHER, minAmount: 100.0, note: "Commission" })).toBe(false);
		});

		it("should return message when amounts are set", () => {
			const msg = constraint.defaultMessage(
				createDefaultMessageArgs({ type: JobPaymentType.OTHER, minAmount: 100.0, note: "Commission" }),
			);

			expect(msg).toBe("Other payment type must not have amount values");
		});

		it("should pass when amounts are explicitly null", () => {
			expect(
				constraint.validate({ type: JobPaymentType.OTHER, minAmount: null, maxAmount: null, note: "Commission" }),
			).toBe(true);
		});

		it("should fail when note is explicitly null", () => {
			expect(constraint.validate({ type: JobPaymentType.OTHER, note: null })).toBe(false);
		});
	});

	describe("invalid input types", () => {
		it("should fail validation when value is null", () => {
			expect(constraint.validate(null)).toBe(false);
		});

		it("should return correct message when value is null", () => {
			const msg = constraint.defaultMessage(createDefaultMessageArgs(null as never));
			expect(msg).toBe("payment is required");
		});

		it("should fail validation when value is undefined", () => {
			expect(constraint.validate(undefined)).toBe(false);
		});

		it("should fail validation when value is not an object", () => {
			expect(constraint.validate("not-an-object")).toBe(false);
		});
	});

	describe("payment type validation", () => {
		it("should fail when type is missing", () => {
			expect(constraint.validate({})).toBe(false);
		});

		it("should return correct message when type is missing", () => {
			const msg = constraint.defaultMessage(createDefaultMessageArgs({} as never));
			expect(msg).toBe(`type must be one of ${Object.values(JobPaymentType).join(", ")}`);
		});

		it("should fail when type is an unknown value", () => {
			expect(constraint.validate({ type: "UNKNOWN" })).toBe(false);
		});

		it("should return correct message when type is unknown", () => {
			const msg = constraint.defaultMessage(createDefaultMessageArgs({ type: "UNKNOWN" as JobPaymentType }));
			expect(msg).toBe(`type must be one of ${Object.values(JobPaymentType).join(", ")}`);
		});

		it("should fail when type is null", () => {
			expect(constraint.validate({ type: null })).toBe(false);
		});
	});
});
