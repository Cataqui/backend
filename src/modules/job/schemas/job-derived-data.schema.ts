import { z } from "zod";

export const JobDerivedDataSchema = z
	.object({
		title: z
			.string()
			.trim()
			.min(1)
			.describe(
				"The shortest useful plain-text title workers can scan in Cataquí's local opportunity feed. Identify the offered role or the gig, shift, service, one-off task, practical help, or outcome the poster wants another person to perform. Use a role name only for a real role; otherwise use a direct, natural task or service phrase rather than inventing a profession or corporate job title. Infer the source language exclusively from the description and write every ordinary title word naturally in that same language. Never translate based on the prompt language, examples, user locale, or platform locale. Decode noisy text from context, use standard natural spelling and grammar, omit unnecessary timing or location details, and do not apply moderation judgments. A title is always required.",
			),
		description_summary: z
			.string()
			.trim()
			.min(1)
			.describe(
				"A truthful, compact mini-pitch that helps a Cataquí worker decide whether to open the post. Write it in the description's language and writing system. Complement the title with the strongest grounded access advantage, fit or flexibility signal, material extra, and any crucial eligibility filter. Prefer facts such as no experience, first-job suitability, training, shift choice, short duration, quick payment, transport, meals, or mandatory requirements over routine duties. Do not include payment amounts, contact details, employer names, or exact location. Preserve the exact relationship between facts and qualifiers; never invent, hype, or end with punctuation.",
			),
	})
	.strict();
