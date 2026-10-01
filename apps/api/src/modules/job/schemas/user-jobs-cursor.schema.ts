import { z } from "zod";

export const UserJobsCursorSchema = z
	.object({
		version: z.literal(1),
		createdAt: z.iso.datetime(),
		jobId: z.uuid(),
	})
	.strict();

export type UserJobsCursor = z.infer<typeof UserJobsCursorSchema>;
