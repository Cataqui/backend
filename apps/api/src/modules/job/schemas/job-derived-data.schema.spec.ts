import { JobDerivedDataSchema } from "./job-derived-data.schema";

describe("JobDataDerivationSchema", () => {
	it("should accept a required title, summary, and payment", () => {
		const result = JobDerivedDataSchema.safeParse({
			title: "Auxiliar de cozinha",
			description_summary: "Preparar alimentos e manter a cozinha organizada",
			payment: "R$ 150 por dia",
		});

		expect(result.success).toBe(true);
	});

	it("should reject a missing summary", () => {
		const result = JobDerivedDataSchema.safeParse({ title: "Auxiliar de cozinha", payment: null });

		expect(result.success).toBe(false);
	});

	it("should reject a missing payment", () => {
		const result = JobDerivedDataSchema.safeParse({
			title: "Auxiliar de cozinha",
			description_summary: "Preparar alimentos e manter a cozinha organizada",
		});
		expect(result.success).toBe(false);
	});

	it("should reject fields outside the derivation contract", () => {
		const result = JobDerivedDataSchema.safeParse({
			title: "Auxiliar de cozinha",
			description_summary: "Preparar alimentos e manter a cozinha organizada",
			payment: null,
			language: "pt",
		});

		expect(result.success).toBe(false);
	});

	it("should trim generated strings", () => {
		const result = JobDerivedDataSchema.parse({
			title: "  A  ",
			description_summary: "  B  ",
			payment: "  R$ 150  ",
		});

		expect(result).toEqual({ title: "A", description_summary: "B", payment: "R$ 150" });
	});

	it("should not enforce maximum lengths because brevity is model guidance rather than a hard output contract", () => {
		expect(
			JobDerivedDataSchema.safeParse({
				title: "A".repeat(1_000),
				description_summary: "B".repeat(10_000),
				payment: "C".repeat(10_000),
			}).success,
		).toBe(true);
	});

	it("should reject whitespace-only generated strings", () => {
		const result = JobDerivedDataSchema.safeParse({
			title: "   ",
			description_summary: "Summary",
			payment: null,
		});

		expect(result.success).toBe(false);
	});

	it("accepts null payment", () => {
		expect(
			JobDerivedDataSchema.parse({ title: "Role", description_summary: "Summary", payment: null }).payment,
		).toBeNull();
	});

	it("trims whitespace-only payment to an empty string for service normalization", () => {
		expect(JobDerivedDataSchema.parse({ title: "Role", description_summary: "Summary", payment: "   " }).payment).toBe(
			"",
		);
	});
});
