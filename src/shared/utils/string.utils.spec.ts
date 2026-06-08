import fc from "fast-check";
import { StringUtils } from "./string.utils";

describe("StringUtils", () => {
	describe("camelToSnake", () => {
		it("should convert categoryId to category_id", () => {
			const result = StringUtils.camelToSnake("categoryId");

			expect(result).toBe("category_id");
		});

		it("should convert phoneNumber to phone_number", () => {
			const result = StringUtils.camelToSnake("phoneNumber");

			expect(result).toBe("phone_number");
		});

		it("should convert amountPeriod to amount_period", () => {
			const result = StringUtils.camelToSnake("amountPeriod");

			expect(result).toBe("amount_period");
		});

		it("should convert multiple consecutive uppercase letters", () => {
			const result = StringUtils.camelToSnake("parseURLString");

			expect(result).toBe("parse_url_string");
		});

		it("should not modify single-word lowercase strings", () => {
			expect(StringUtils.camelToSnake("title")).toBe("title");
			expect(StringUtils.camelToSnake("description")).toBe("description");
			expect(StringUtils.camelToSnake("type")).toBe("type");
		});

		it("should return empty string for empty input", () => {
			expect(StringUtils.camelToSnake("")).toBe("");
		});

		it("should handle strings starting with uppercase", () => {
			const result = StringUtils.camelToSnake("CategoryId");

			expect(result).toBe("category_id");
		});

		it("should convert jobId to job_id", () => {
			const result = StringUtils.camelToSnake("jobId");

			expect(result).toBe("job_id");
		});

		it("should handle minAmount and maxAmount", () => {
			expect(StringUtils.camelToSnake("minAmount")).toBe("min_amount");
			expect(StringUtils.camelToSnake("maxAmount")).toBe("max_amount");
		});

		it("should not modify strings that are already snake_case", () => {
			expect(StringUtils.camelToSnake("category_id")).toBe("category_id");
			expect(StringUtils.camelToSnake("phone_number")).toBe("phone_number");
		});

		it("should return a string for any input (property-based)", () => {
			fc.assert(
				fc.property(fc.string({ minLength: 0, maxLength: 30 }), (input) => {
					const result = StringUtils.camelToSnake(input);

					expect(typeof result).toBe("string");
				}),
			);
		});

		it("should produce valid snake_case from camelCase (property-based)", () => {
			fc.assert(
				fc.property(
					fc.string({ minLength: 2, maxLength: 20 }).map((s) => "a" + s + "Id"),
					(input) => {
						const sanitized = input.replace(/[^a-zA-Z]/g, "x");
						const result = StringUtils.camelToSnake(sanitized);

						expect(result).toMatch(/^[a-z][a-z0-9_]*$/);
						expect(result).not.toContain("__");
						expect(result.includes("_id")).toBe(true);
					},
				),
			);
		});
	});
});
