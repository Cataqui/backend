import { z } from "zod";

export const FeedPaginationCursorSchema = z.object({
	version: z.number(),
	sort: z.string(),
	createdAt: z.string().datetime(),
	jobId: z.string().uuid(),
});

export type IFeedPaginationCursor = z.infer<typeof FeedPaginationCursorSchema>;
