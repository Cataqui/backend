import { Injectable } from "@nestjs/common";
import type { z } from "zod";
import { PaginatedResult, type PaginatedResult as PaginatedResultType } from "../../shared/results/paginated-result";
import { FeedRepository } from "./repositories/feed.repository";
import { toFeedItemOutput } from "./schemas/feed-item-output.mapper";
import { FeedItemOutputSchema } from "./schemas/feed-item-output.schema";
import { decodeFeedPaginationCursor, encodeFeedPaginationCursor } from "./utils/cursor.utils";

@Injectable()
export class FeedService {
	constructor(private readonly _feedRepository: FeedRepository) {}

	async getFeed(params: {
		cursor?: string | undefined;
	}): Promise<PaginatedResultType<z.infer<typeof FeedItemOutputSchema>>> {
		const limit = 20;
		const cursorPosition = params.cursor ? decodeFeedPaginationCursor({ cursor: params.cursor }) : undefined;

		const rawFeedResults = await this._feedRepository.getFeedItems({ cursor: cursorPosition, limit: limit + 1 });

		const hasMore = rawFeedResults.length > limit;
		const rawItems = hasMore ? rawFeedResults.slice(0, limit) : rawFeedResults;

		let nextCursor: string | null = null;

		if (hasMore) {
			const lastItem = rawItems.at(-1);
			if (lastItem === undefined) throw new Error("Paginated feed results unexpectedly contain no items");

			nextCursor = encodeFeedPaginationCursor({
				createdAt: lastItem.createdAt.toISOString(),
				jobId: lastItem.id,
			});
		}

		const items = rawItems.map((item) => toFeedItemOutput({ job: item }));
		return PaginatedResult.create({
			data: items,
			pagination: { hasMore: hasMore, nextCursor: nextCursor },
		});
	}
}
