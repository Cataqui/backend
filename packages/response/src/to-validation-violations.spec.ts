import { z } from "zod";
import { toValidationViolations } from "./to-validation-violations";
import { ValidationViolationSchema } from "./validation-violation.schema";

it("preserves nested keys, indexes, literal dots, and issue order without mutating readonly input", () => {
	const path = Object.freeze(["items", 0, "a.b"]);
	const issues = Object.freeze([
		Object.freeze({ path: path, message: "First" }),
		Object.freeze({ message: "Root" }),
	] as const);
	const result = toValidationViolations({ issues: issues });
	expect(result).toEqual([
		{ path: ["items", 0, "a.b"], message: "First" },
		{ path: [], message: "Root" },
	]);
	expect(result[0]?.path).not.toBe(path);
	expect(issues[0]?.path).toEqual(["items", 0, "a.b"]);
});

it("normalizes wrapped keys, symbols, and non-index numbers into serializable paths", () => {
	const result = toValidationViolations({
		issues: [
			{
				path: [
					{ key: "contacts" },
					{ key: 2 },
					Symbol("private"),
					{ key: Symbol("hidden") },
					-1,
					0.5,
					Infinity,
					Number.MAX_SAFE_INTEGER + 1,
				],
				message: "Requirement",
			},
		],
	});
	expect(result).toEqual([
		{ path: ["contacts", 2, "$", "$", "-1", "0.5", "Infinity", "9007199254740992"], message: "Requirement" },
	]);
	expect(ValidationViolationSchema.parse(result[0])).toEqual(result[0]);
});

it("returns no violations for empty input", () => {
	expect(toValidationViolations({ issues: [] })).toEqual([]);
});

it("preserves full messages and paths beyond the old Mapshot diagnostic limits", () => {
	const key = "k".repeat(300);
	const message = "m".repeat(1000);
	expect(toValidationViolations({ issues: [{ path: [key], message: message }] })).toEqual([
		{ path: [key], message: message },
	]);
});

it("sanitizes real Zod unknown-key and union issues without exposing submitted data", async () => {
	const schema = z.strictObject({ value: z.union([z.string(), z.number()]) });
	const input = { value: { secret: "submitted-value" }, "submitted-key": true };
	const parsed = schema.safeParse(input);
	expect(parsed.success).toBe(false);
	if (parsed.success) throw new Error("Expected validation failure");
	const violations = toValidationViolations({ issues: parsed.error.issues });
	expect(violations).toEqual([
		{ path: ["value"], message: "Must match one of the supported alternatives." },
		{ path: [], message: "Only documented fields are supported." },
	]);
	const standard = await schema["~standard"].validate(input);
	expect(toValidationViolations({ issues: standard.issues ?? [] })).toEqual(violations);
	expect(JSON.stringify(violations)).not.toContain("submitted");
});

it("preserves schema-authored requirements for ordinary Zod failures", () => {
	const parsed = z
		.object({ values: z.array(z.number().positive("Must be greater than zero.")) })
		.safeParse({ values: [-1] });
	if (parsed.success) throw new Error("Expected validation failure");
	expect(toValidationViolations({ issues: parsed.error.issues })).toEqual([
		{ path: ["values", 0], message: "Must be greater than zero." },
	]);
});
