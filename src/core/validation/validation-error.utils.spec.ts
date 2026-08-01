import type { ValidationError } from "class-validator";
import { ValidationErrorUtils } from "./validation-error.utils";

describe("formatValidationErrors", () => {
	it("should convert camelCase property to snake_case in standard messages", () => {
		const errors: ValidationError[] = [
			{
				property: "customerId",
				constraints: {
					isUUID: "customerId must be a UUID",
				},
			},
		];

		const result = ValidationErrorUtils.formatValidationErrors(errors);

		expect(result).toEqual(["customer_id must be a UUID"]);
	});

	it("should not modify single-word property names", () => {
		const errors: ValidationError[] = [
			{
				property: "title",
				constraints: {
					isLength: "title must be longer than or equal to 3 characters",
				},
			},
		];

		const result = ValidationErrorUtils.formatValidationErrors(errors);

		expect(result).toEqual(["title must be longer than or equal to 3 characters"]);
	});

	it("should handle multiple errors on the same property", () => {
		const errors: ValidationError[] = [
			{
				property: "title",
				constraints: {
					isString: "title must be a string",
					isLength: "title must be longer than or equal to 3 characters",
				},
			},
		];

		const result = ValidationErrorUtils.formatValidationErrors(errors);

		expect(result).toHaveLength(2);
		expect(result).toContain("title must be a string");
		expect(result).toContain("title must be longer than or equal to 3 characters");
	});

	it("should handle multiple top-level errors", () => {
		const errors: ValidationError[] = [
			{
				property: "customerId",
				constraints: {
					isUUID: "customerId must be a UUID",
				},
			},
			{
				property: "title",
				constraints: {
					isLength: "title must be longer than or equal to 3 characters",
				},
			},
		];

		const result = ValidationErrorUtils.formatValidationErrors(errors);

		expect(result).toEqual(["customer_id must be a UUID", "title must be longer than or equal to 3 characters"]);
	});

	it("should handle nested validation errors with property path prefix", () => {
		const errors: ValidationError[] = [
			{
				property: "contact",
				children: [
					{
						property: "phoneNumber",
						constraints: {
							isPhoneNumber: "phoneNumber must be a valid phone number",
						},
					},
				],
			},
		];

		const result = ValidationErrorUtils.formatValidationErrors(errors);

		expect(result).toEqual(["contact.phone_number must be a valid phone number"]);
	});

	it("should handle deeply nested validation errors", () => {
		const errors: ValidationError[] = [
			{
				property: "payment",
				children: [
					{
						property: "amountPeriod",
						constraints: {
							isEnum: "amountPeriod must be one of the following values: DAILY, WEEKLY",
						},
					},
				],
			},
		];

		const result = ValidationErrorUtils.formatValidationErrors(errors);

		expect(result).toEqual(["payment.amount_period must be one of the following values: DAILY, WEEKLY"]);
	});

	it("should prefix custom validator messages that do not start with property name", () => {
		const errors: ValidationError[] = [
			{
				property: "payment",
				constraints: {
					isValidJobPayment: "Fixed payment requires a minimum amount",
				},
			},
		];

		const result = ValidationErrorUtils.formatValidationErrors(errors);

		expect(result).toEqual(["payment: Fixed payment requires a minimum amount"]);
	});

	it("should handle nested errors with custom validator messages", () => {
		const errors: ValidationError[] = [
			{
				property: "payment",
				children: [
					{
						property: "minAmount",
						constraints: {
							isPositive: "minAmount must be a positive number",
						},
					},
				],
			},
		];

		const result = ValidationErrorUtils.formatValidationErrors(errors);

		expect(result).toEqual(["payment.min_amount must be a positive number"]);
	});

	it("should return empty array for empty errors", () => {
		const result = ValidationErrorUtils.formatValidationErrors([]);

		expect(result).toEqual([]);
	});

	it("should handle errors with no constraints and no children", () => {
		const errors: ValidationError[] = [
			{
				property: "customerId",
			},
		];

		const result = ValidationErrorUtils.formatValidationErrors(errors);

		expect(result).toEqual([]);
	});

	it("should handle nested errors with constraints on parent", () => {
		const errors: ValidationError[] = [
			{
				property: "contact",
				constraints: {
					isDefined: "contact should not be null or undefined",
				},
				children: [
					{
						property: "phoneNumber",
						constraints: {
							isPhoneNumber: "phoneNumber must be a valid phone number",
						},
					},
				],
			},
		];

		const result = ValidationErrorUtils.formatValidationErrors(errors);

		expect(result).toContain("contact should not be null or undefined");
		expect(result).toContain("contact.phone_number must be a valid phone number");
	});

	it("should handle phoneNumber to phone_number conversion", () => {
		const errors: ValidationError[] = [
			{
				property: "phoneNumber",
				constraints: {
					isPhoneNumber: "phoneNumber must be a valid phone number",
				},
			},
		];

		const result = ValidationErrorUtils.formatValidationErrors(errors);

		expect(result).toEqual(["phone_number must be a valid phone number"]);
	});

	it("should handle minAmount to min_amount conversion", () => {
		const errors: ValidationError[] = [
			{
				property: "minAmount",
				constraints: {
					isPositive: "minAmount must be a positive number",
				},
			},
		];

		const result = ValidationErrorUtils.formatValidationErrors(errors);

		expect(result).toEqual(["min_amount must be a positive number"]);
	});

	it("should handle maxAmount to max_amount conversion", () => {
		const errors: ValidationError[] = [
			{
				property: "maxAmount",
				constraints: {
					isPositive: "maxAmount must be a positive number",
				},
			},
		];

		const result = ValidationErrorUtils.formatValidationErrors(errors);

		expect(result).toEqual(["max_amount must be a positive number"]);
	});

	it("should handle amountPeriod to amount_period conversion", () => {
		const errors: ValidationError[] = [
			{
				property: "amountPeriod",
				constraints: {
					isEnum: "amountPeriod must be one of the following values: SINGLE, HOURLY, DAILY, WEEKLY, MONTHLY",
				},
			},
		];

		const result = ValidationErrorUtils.formatValidationErrors(errors);

		expect(result).toEqual([
			"amount_period must be one of the following values: SINGLE, HOURLY, DAILY, WEEKLY, MONTHLY",
		]);
	});

	it("should handle contactMethod to contact_method conversion", () => {
		const errors: ValidationError[] = [
			{
				property: "contactMethod",
				constraints: {
					isEnum: "contactMethod must be one of the following values: WHATSAPP, PHONE_CALL",
				},
			},
			{
				property: "contact",
				children: [
					{
						property: "contactMethod",
						constraints: {
							isEnum: "contactMethod must be one of the following values: WHATSAPP, PHONE_CALL",
						},
					},
				],
			},
		];

		const result = ValidationErrorUtils.formatValidationErrors(errors);

		expect(result).toEqual([
			"contact_method must be one of the following values: WHATSAPP, PHONE_CALL",
			"contact.contact_method must be one of the following values: WHATSAPP, PHONE_CALL",
		]);
	});

	it("should handle deeply nested contact_details path conversion", () => {
		const errors: ValidationError[] = [
			{
				property: "contact",
				children: [
					{
						property: "contactDetails",
						children: [
							{
								property: "phoneNumber",
								constraints: {
									isPhoneNumber: "phoneNumber must be a valid phone number",
								},
							},
						],
					},
				],
			},
		];

		const result = ValidationErrorUtils.formatValidationErrors(errors);

		expect(result).toEqual(["contact.contact_details.phone_number must be a valid phone number"]);
	});

	it("should pass through forbidNonWhitelisted messages unchanged", () => {
		const errors: ValidationError[] = [
			{
				property: "unknown_field",
				constraints: {
					whitelistValidation: "property unknown_field should not exist",
				},
			},
		];

		const result = ValidationErrorUtils.formatValidationErrors(errors);

		expect(result).toEqual(["unknown_field: property unknown_field should not exist"]);
	});
});
