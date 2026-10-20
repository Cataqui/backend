import { z } from "zod";

export const ProfileJobsInputSchema = z
	.object({
		cursor: z.base64url().max(512).optional().describe("Cursor for the next page of posted jobs"),
	})
	.strict()
	.meta({ id: "ProfileJobsInput" });
