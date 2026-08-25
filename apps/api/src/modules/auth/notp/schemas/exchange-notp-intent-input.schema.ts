import { z } from "zod";

export const ExchangeNotpIntentInputSchema = z
	.object({
		intentToken: z
			.string({ error: "intentToken must be a string. Example: kJ3YFf0SYkZp6gWlMTq3up5ELXWRw_zTuF8j0M5tJgI" })
			.regex(/^[A-Za-z0-9_-]{43}$/, {
				error:
					"intentToken must be the 43-character URL-safe token returned when the intent was created. Example: kJ3YFf0SYkZp6gWlMTq3up5ELXWRw_zTuF8j0M5tJgI",
			})
			.describe("Secret token returned with the intent. It proves that this client created the intent."),
	})
	.strict()
	.meta({ id: "ExchangeNotpIntentInput" });
