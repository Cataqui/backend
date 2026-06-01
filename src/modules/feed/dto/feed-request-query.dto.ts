import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import { IsOptional, IsString, IsEnum, MaxLength } from "class-validator";
import { IsIFeedPaginationCursor } from "../decorators/is-feed-pagination-cursor.decorator";
import { FeedSort } from "../enums/feed-sort.enum";
import { DEFAULT_FEED_SORT } from "../feed.constants";

export class FeedRequestQueryDto {
	@Expose({ name: "cursor" })
	@ApiProperty({ name: "cursor", description: "Base64-encoded sort-aware cursor for pagination", required: false, type: String })
	@IsOptional()
	@IsString()
	@MaxLength(512)
	@IsIFeedPaginationCursor()
	readonly cursor: string | undefined;

	@Expose({ name: "sort" })
	@ApiProperty({ name: "sort", enum: FeedSort, description: "Sort mode for the feed", required: false, example: FeedSort.LATEST, default: DEFAULT_FEED_SORT })
	@IsOptional()
	@IsEnum(FeedSort)
	readonly sort: FeedSort | undefined;
}
