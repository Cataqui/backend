import { Controller, Get, HttpCode, HttpStatus, Query, Version } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { z } from "zod";
import type { PaginatedResult } from "../../shared/results/paginated-result";
import { ApiGetFeedDocs } from "./decorators/api-get-feed-docs.decorator";
import { FeedItemOutputSchema } from "./schemas/feed-item-output.schema";
import { FeedInputSchema } from "./schemas/feed-input.schema";
import { FeedService } from "./feed.service";

@ApiTags("feed")
@ApiBearerAuth()
@Controller("feed")
export class FeedController {
	constructor(private readonly _feedService: FeedService) {}

	@Get()
	@Version("1")
	@HttpCode(HttpStatus.OK)
	@ApiGetFeedDocs()
	async getFeed(
		@Query({ schema: FeedInputSchema }) query: z.infer<typeof FeedInputSchema>,
	): Promise<PaginatedResult<z.infer<typeof FeedItemOutputSchema>>> {
		return this._feedService.getFeed({
			cursor: query.cursor,
		});
	}
}
