import { z } from "zod";

export const AddressDetailsInputSchema = z
	.object({
		addressId: z.string().trim().min(1).max(256),
		sessionToken: z
			.string()
			.min(1)
			.max(36)
			.regex(/^[A-Za-z0-9_-]+$/, "sessionToken must be URL-safe"),
	})
	.strict();
