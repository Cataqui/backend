import { z } from "zod";

export const CreateJobDraftInputSchema = z
	.object({
		description: z
			.string({
				error: "description must be a string containing the original job text. Example: Vaga de auxiliar de cozinha.",
			})
			.trim()
			.min(10, {
				error: "description must contain between 10 and 10000 characters. Example: Vaga de auxiliar de cozinha.",
			})
			.max(10_000, {
				error: "description must contain between 10 and 10000 characters. Example: Vaga de auxiliar de cozinha.",
			})
			.describe("The job description used to create the draft."),
	})
	.strict()
	.meta({ id: "CreateJobDraftInput" });
