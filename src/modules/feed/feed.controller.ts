import { Controller, Get, Version, Query, HttpCode, HttpStatus } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { FeedService } from "./feed.service";
import { FeedRequestQueryDto } from "./dto/feed-request-query.dto";
import { PaginatedResponseDto } from "../../shared/dto/paginated-response.dto";
import { FeedItemOutputDto } from "./dto/feed-item-output.dto";
import { ApiGetFeedDocs } from "./decorators/api-get-feed-docs.decorator";

@ApiTags("feed")
@Controller("feed")
export class FeedController {
	constructor(private readonly _feedService: FeedService) {}

	@Get()
	@Version("1")
	@HttpCode(HttpStatus.OK)
	@ApiGetFeedDocs()
	async getFeed(@Query() query: FeedRequestQueryDto): Promise<PaginatedResponseDto<FeedItemOutputDto>> {
		return this._feedService.getFeed({
			cursor: query.cursor,
			sort: query.sort,
		});
	}
}
