import { z } from "zod";

export const NameAnalysisOutputSchema = z.strictObject({
	givenName: z
		.string()
		.trim()
		.min(1)
		.max(100)
		.nullable()
		.describe(
			"Likely everyday given name for a friendly greeting, preserving familiar compounds and supplied spelling and script. A supplied familiar form may be used; this is not a verified personal preference. Null when unidentifiable.",
		),
	meaning: z
		.string()
		.trim()
		.min(1)
		.max(160)
		.nullable()
		.describe(
			"Meaning of the complete returned givenName in the requested language. Prefer the actual meaning; otherwise use an established conventional name interpretation. Null only when neither is genuinely known. Never a partial component meaning.",
		),
});
export type NameAnalysisOutput = z.infer<typeof NameAnalysisOutputSchema>;
