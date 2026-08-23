import { z } from "zod";

export const FeedPaginationCursorSchema = z
	.object({
		version: z.number(),
		createdAt: z.iso.datetime(),
		jobId: z.uuid(),
	})
	.strict();

export type FeedPaginationCursor = z.infer<typeof FeedPaginationCursorSchema>;
