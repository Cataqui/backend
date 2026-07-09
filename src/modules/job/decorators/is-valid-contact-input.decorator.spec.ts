import fc from "fast-check";
import { JobContactMethod } from "../../../../generated/prisma/client.js";
import { IsValidContactInputConstraint } from "./is-valid-contact-input.decorator";

function makeValidationArgs(contact: Record<string, unknown>): Parameters<IsValidContactInputConstraint["defaultMessage"]>[0] {
	return {
		object: {},
		property: "contact",
		targetName: "CreateJobRequestDto",
		value: contact,
		constraints: [],
	};
}

describe("IsValidContactInputConstraint", () => {
	let constraint: IsValidContactInputConstraint;

	beforeEach(() => {
		constraint = new IsValidContactInputConstraint();
	});

	describe("WHATSAPP", () => {
		it("should pass with valid Brazilian phone number", () => {
			const result = constraint.validate({ contactMethod: JobContactMethod.WHATSAPP, identifier: "+5511999999999" });

			expect(result).toBe(true);
		});

		it("should pass with valid US phone number", () => {
			const result = constraint.validate({ contactMethod: JobContactMethod.WHATSAPP, identifier: "+14155552671" });

			expect(result).toBe(true);
		});

		it("should fail when identifier does not start with +", () => {
			const result = constraint.validate({ contactMethod: JobContactMethod.WHATSAPP, identifier: "5511999999999" });

			expect(result).toBe(false);
		});

		it("should fail with obviously invalid identifier", () => {
			const result = constraint.validate({ contactMethod: JobContactMethod.WHATSAPP, identifier: "abc" });

			expect(result).toBe(false);
		});

		it("should return descriptive message when identifier is not a phone number", () => {
			const msg = constraint.defaultMessage(
				makeValidationArgs({ contactMethod: JobContactMethod.WHATSAPP, identifier: "5511999999999" }),
			);

			expect(msg).toBe(
				"identifier for the contact method WHATSAPP must be a phone number with country code, starting with + followed by the country and local number. Example: +5511999999999",
			);
		});
	});

	describe("PHONE_CALL", () => {
		it("should pass with valid Brazilian phone number", () => {
			const result = constraint.validate({ contactMethod: JobContactMethod.PHONE_CALL, identifier: "+5511999999999" });

			expect(result).toBe(true);
		});

		it("should pass with valid UK phone number", () => {
			const result = constraint.validate({ contactMethod: JobContactMethod.PHONE_CALL, identifier: "+447911123456" });

			expect(result).toBe(true);
		});

		it("should fail when identifier does not start with +", () => {
			const result = constraint.validate({ contactMethod: JobContactMethod.PHONE_CALL, identifier: "5511999999999" });

			expect(result).toBe(false);
		});

		it("should fail with letters only", () => {
			const result = constraint.validate({ contactMethod: JobContactMethod.PHONE_CALL, identifier: "not-a-number" });

			expect(result).toBe(false);
		});

		it("should return descriptive message when identifier is not a phone number", () => {
			const msg = constraint.defaultMessage(
				makeValidationArgs({ contactMethod: JobContactMethod.PHONE_CALL, identifier: "5511999999999" }),
			);

			expect(msg).toBe(
				"identifier for the contact method PHONE_CALL must be a phone number with country code, starting with + followed by the country and local number. Example: +5511999999999",
			);
		});
	});

	describe("identifier edge cases", () => {
		it("should fail when identifier is undefined", () => {
			const result = constraint.validate({ contactMethod: JobContactMethod.WHATSAPP, identifier: undefined });

			expect(result).toBe(false);
		});

		it("should return correct message when identifier is undefined", () => {
			const msg = constraint.defaultMessage(
				makeValidationArgs({ contactMethod: JobContactMethod.WHATSAPP, identifier: undefined }),
			);

			expect(msg).toBe("contact identifier is required");
		});

		it("should fail when identifier is null", () => {
			const result = constraint.validate({ contactMethod: JobContactMethod.WHATSAPP, identifier: null });

			expect(result).toBe(false);
		});

		it("should return correct message when identifier is null", () => {
			const msg = constraint.defaultMessage(
				makeValidationArgs({ contactMethod: JobContactMethod.WHATSAPP, identifier: null }),
			);

			expect(msg).toBe("contact identifier is required");
		});

		it("should fail when identifier is an empty string", () => {
			const result = constraint.validate({ contactMethod: JobContactMethod.WHATSAPP, identifier: "" });

			expect(result).toBe(false);
		});

		it("should return correct message when identifier is empty", () => {
			const msg = constraint.defaultMessage(
				makeValidationArgs({ contactMethod: JobContactMethod.WHATSAPP, identifier: "" }),
			);

			expect(msg).toBe("contact identifier is required");
		});

		it("should fail when identifier is whitespace only", () => {
			const result = constraint.validate({ contactMethod: JobContactMethod.WHATSAPP, identifier: "   " });

			expect(result).toBe(false);
		});

		it("should return correct message when identifier is whitespace only", () => {
			const msg = constraint.defaultMessage(
				makeValidationArgs({ contactMethod: JobContactMethod.WHATSAPP, identifier: "   " }),
			);

			expect(msg).toBe("contact identifier must not be empty");
		});

		it("should fail when identifier is a number", () => {
			const result = constraint.validate({ contactMethod: JobContactMethod.WHATSAPP, identifier: 12345 } as Record<string, unknown>);

			expect(result).toBe(false);
		});

		it("should return correct message when identifier is a number", () => {
			const msg = constraint.defaultMessage(
				makeValidationArgs({ contactMethod: JobContactMethod.WHATSAPP, identifier: 12345 }),
			);

			expect(msg).toBe("contact identifier must be a string");
		});

		it("should fail when identifier is an array", () => {
			const result = constraint.validate({ contactMethod: JobContactMethod.WHATSAPP, identifier: ["+5511999999999"] } as Record<string, unknown>);

			expect(result).toBe(false);
		});

		it("should return correct message when identifier is an array", () => {
			const msg = constraint.defaultMessage(
				makeValidationArgs({ contactMethod: JobContactMethod.WHATSAPP, identifier: ["+5511999999999"] }),
			);

			expect(msg).toBe("contact identifier must be a string");
		});

		it("should fail when identifier is a plain object", () => {
			const result = constraint.validate({ contactMethod: JobContactMethod.WHATSAPP, identifier: { phone: "+5511999999999" } } as Record<string, unknown>);

			expect(result).toBe(false);
		});

		it("should return correct message when identifier is an object", () => {
			const msg = constraint.defaultMessage(
				makeValidationArgs({ contactMethod: JobContactMethod.WHATSAPP, identifier: { phone: "+5511999999999" } }),
			);

			expect(msg).toBe("contact identifier must be a string");
		});

		it("should fail when contact is null", () => {
			const result = constraint.validate(null);

			expect(result).toBe(false);
		});

		it("should return correct message when contact is null", () => {
			const msg = constraint.defaultMessage(
				makeValidationArgs(null as unknown as Record<string, unknown>),
			);

			expect(msg).toBe("contact is required");
		});
	});

	describe("contact method edge cases", () => {
		it("should fail when contact method is undefined", () => {
			const result = constraint.validate({ identifier: "+5511999999999" });

			expect(result).toBe(false);
		});

		it("should return correct message when contact method is undefined", () => {
			const msg = constraint.defaultMessage(makeValidationArgs({ identifier: "+5511999999999" }));

			expect(msg).toBe("contact_method must be set to a supported contact method: WHATSAPP, PHONE_CALL");
		});

		it("should fail when contact method is an unknown string", () => {
			const result = constraint.validate({ contactMethod: "EMAIL", identifier: "+5511999999999" });

			expect(result).toBe(false);
		});

		it("should return correct message when contact method is unknown", () => {
			const msg = constraint.defaultMessage(makeValidationArgs({ contactMethod: "EMAIL", identifier: "+5511999999999" }));

			expect(msg).toBe("contact_method must be set to a supported contact method: WHATSAPP, PHONE_CALL");
		});

		it("should fail when contact method is null", () => {
			const result = constraint.validate({ contactMethod: null, identifier: "+5511999999999" });

			expect(result).toBe(false);
		});
	});

	describe("fuzz testing", () => {
		it("should reject strings that do not start with +", () => {
			fc.assert(
				fc.property(fc.string(), (value) => {
					fc.pre(!value.startsWith("+"));
					fc.pre(value.length > 0);

					const result = constraint.validate({ contactMethod: JobContactMethod.WHATSAPP, identifier: value });

					return result === false;
				}),
			);
		});

		it("should reject empty and whitespace strings", () => {
			fc.assert(
				fc.property(fc.string(), (value) => {
					const result = constraint.validate({ contactMethod: JobContactMethod.WHATSAPP, identifier: value });

					if (value.length === 0) return result === false;
					if (value.trim().length === 0) return result === false;
					return true;
				}),
			);
		});

		it("should accept valid international phone numbers from various countries", () => {
			const validPhoneNumbers = [
				"+5511999999999",
				"+5521988887777",
				"+5541999999999",
				"+14155552671",
				"+447911123456",
			];

			for (const phone of validPhoneNumbers) {
				const result = constraint.validate({ contactMethod: JobContactMethod.WHATSAPP, identifier: phone });

				expect(result).toBe(true);
			}
		});

		it("should reject obviously invalid phone-like patterns", () => {
			const invalidPatterns = [
				"not-a-phone",
				"12345",
				"",
				"   ",
			];

			for (const value of invalidPatterns) {
				const result = constraint.validate({ contactMethod: JobContactMethod.WHATSAPP, identifier: value });

				expect(result).toBe(false);
			}
		});
	});
});
