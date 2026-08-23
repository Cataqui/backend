import { z } from "zod";

export const AddressSearchInputSchema = z
	.object({
		query: z
			.string()
			.max(256)
			.transform((query) => query.trim()),
		sessionToken: z
			.string()
			.min(1)
			.max(36)
			.regex(/^[A-Za-z0-9_-]+$/, "sessionToken must be URL-safe"),
	})
	.strict();
