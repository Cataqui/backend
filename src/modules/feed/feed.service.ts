import { Injectable } from "@nestjs/common";
import { PaginatedResponseDto } from "../../shared/dto/paginated-response.dto";
import { PaginationOutputDto } from "../../shared/dto/pagination-output.dto";
import { FeedRepository } from "./repositories/feed.repository";
import { CursorUtils } from "./utils/cursor.utils";
import { FeedItemOutputDto } from "./dto/feed-item-output.dto";
import type { FeedSort } from "./enums/feed-sort.enum";
import { FEED_ITEMS_RESPONSE_LIMIT, DEFAULT_FEED_SORT } from "./feed.constants";
import { MapService } from "../map/map.service";

@Injectable()
export class FeedService {
	constructor(
		private readonly _feedRepository: FeedRepository,
		private readonly _mapService: MapService,
	) {}

	async getFeed(params: { cursor?: string | undefined; sort?: FeedSort | undefined }): Promise<PaginatedResponseDto<FeedItemOutputDto>> {
		const limit = FEED_ITEMS_RESPONSE_LIMIT;
		const sort = params.sort ?? DEFAULT_FEED_SORT;
		const cursorPosition = params.cursor ? CursorUtils.decodeCursor(params.cursor, sort) : undefined;

		const rawFeedResults = await this._feedRepository.getFeedItems({ cursor: cursorPosition, limit: limit + 1 });

		const hasMore = rawFeedResults.length > limit;
		const rawItems = hasMore ? rawFeedResults.slice(0, limit) : rawFeedResults;

		let nextCursor: string | null = null;

		if (hasMore) {
			const lastItem = rawItems[rawItems.length - 1]!;

			nextCursor = CursorUtils.encodeCursor({
				sort,
				createdAt: lastItem.createdAt.toISOString(),
				jobId: lastItem.id,
			});
		}

		const mapAuth = await this._mapService.authenticate({ region: "BR" });
		const items = rawItems.map((item) => FeedItemOutputDto.fromDatabase(item, mapAuth));
		return new PaginatedResponseDto(items, new PaginationOutputDto(hasMore, nextCursor));
	}
}
