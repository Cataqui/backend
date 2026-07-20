import { Controller, Get, HttpCode, HttpStatus, Query, Version } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { PaginatedResponseDto } from "../../shared/dto/paginated-response.dto";
import { ApiGetFeedDocs } from "./decorators/api-get-feed-docs.decorator";
import { FeedItemOutputDto } from "./dto/feed-item-output.dto";
import { FeedRequestQueryDto } from "./dto/feed-request-query.dto";
import { FeedService } from "./feed.service";

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
