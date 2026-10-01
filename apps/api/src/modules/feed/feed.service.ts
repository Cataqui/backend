import { Injectable } from "@nestjs/common";
import type { z } from "zod";
import { PaginatedResult, type PaginatedResult as PaginatedResultType } from "../../shared/results/paginated-result";
import { MicroservicesAuthService } from "../auth/microservices-auth/microservices-auth.service";
import { toFuzzyJobLocationOutput } from "../job/schemas/fuzzy-job-location-output.mapper";
import { FeedRepository } from "./repositories/feed.repository";
import { toFeedItemOutput } from "./schemas/feed-item-output.mapper";
import { FeedItemOutputSchema } from "./schemas/feed-item-output.schema";
import { decodeFeedPaginationCursor, encodeFeedPaginationCursor } from "./utils/cursor.utils";

@Injectable()
export class FeedService {
	constructor(
		private readonly _feedRepository: FeedRepository,
		private readonly _microservicesAuth: MicroservicesAuthService,
	) {}

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

		const items = await Promise.all(
			rawItems.map(async (item) =>
				toFeedItemOutput({
					job: item,
					location: toFuzzyJobLocationOutput({
						fuzzyLatitude: item.fuzzyLatitude,
						fuzzyLongitude: item.fuzzyLongitude,
						imageAccessToken: await this._microservicesAuth.createGeoimageAccessToken({
							latitude: item.fuzzyLatitude.toNumber(),
							longitude: item.fuzzyLongitude.toNumber(),
						}),
					}),
				}),
			),
		);

		return PaginatedResult.create({
			data: items,
			pagination: { hasMore: hasMore, nextCursor: nextCursor },
		});
	}
}
