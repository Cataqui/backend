import { z } from "zod";

export const ProfileJobsCursorSchema = z
	.object({
		version: z.literal(1),
		createdAt: z.iso.datetime(),
		jobId: z.uuid(),
	})
	.strict();

export type ProfileJobsCursor = z.infer<typeof ProfileJobsCursorSchema>;
