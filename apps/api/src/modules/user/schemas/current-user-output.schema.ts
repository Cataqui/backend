import { z } from "zod";

export const CurrentUserOutputSchema = z
	.object({
		userId: z.uuid(),
		displayIdentifier: z.string().min(1).max(320),
	})
	.strict()
	.meta({ id: "CurrentUserOutput" });
