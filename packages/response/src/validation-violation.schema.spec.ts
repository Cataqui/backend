import { ValidationViolationSchema } from "./validation-violation.schema";

describe("ValidationViolationSchema", () => {
	it("should accept property names and array indexes in one validation path", () => {
		expect(
			ValidationViolationSchema.parse({
				path: ["contacts", 0, "identifier"],
				message: "must be a phone number",
			}),
		).toEqual({ path: ["contacts", 0, "identifier"], message: "must be a phone number" });
	});

	it("should reject provider-specific validation metadata", () => {
		expect(() =>
			ValidationViolationSchema.parse({
				path: ["payment", "minAmount"],
				message: "must be positive",
				code: "too_small",
			}),
		).toThrow();
	});

	it("should reject negative array indexes in validation paths", () => {
		expect(() =>
			ValidationViolationSchema.parse({
				path: ["contacts", -1, "identifier"],
				message: "must be a phone number",
			}),
		).toThrow();
	});
});

it.each(["contacts.0.identifier", ["contacts", 0.5], ["contacts", Symbol("private")]])(
	"rejects a legacy or non-serializable validation path %j",
	(path) => {
		expect(ValidationViolationSchema.safeParse({ path: path, message: "Requirement" }).success).toBe(false);
	},
);

it("accepts root violations and preserves the documented component identity", () => {
	expect(ValidationViolationSchema.parse({ path: [], message: "Requirement" })).toEqual({
		path: [],
		message: "Requirement",
	});
	expect(ValidationViolationSchema.meta()?.id).toBe("ValidationViolation");
});
