import { z } from "zod";

export const FeedInputSchema = z
	.object({
		cursor: z
			.base64url({ error: "cursor must be a Base64 URL encoded string" })
			.max(512)
			.optional()
			.describe("Base64 URL encoded cursor for pagination"),
	})
	.strict()
	.meta({ id: "FeedInput" });
