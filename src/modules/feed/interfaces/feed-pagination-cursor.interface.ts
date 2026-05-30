import { z } from "zod";

export const FeedPaginationCursorSchema = z.object({
	version: z.number(),
	sort: z.string(),
	createdAt: z.string(),
	jobId: z.string(),
});

export type IFeedPaginationCursor = z.infer<typeof FeedPaginationCursorSchema>;
