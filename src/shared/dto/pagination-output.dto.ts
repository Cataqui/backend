import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";

export class PaginationOutputDto {
	@Expose({ name: "has_more" })
	@ApiProperty({
		name: "has_more",
		description: "Whether more results exist beyond this page",
		example: true,
	})
	readonly hasMore: boolean;

	@Expose({ name: "next_cursor" })
	@ApiProperty({
		name: "next_cursor",
		description: "Cursor to fetch the next page of results",
		nullable: true,
		example: "eyJpZCI6ImRlZjQ1NiJ9",
	})
	readonly nextCursor: string | null;

	constructor(hasMore: boolean, nextCursor: string | null) {
		this.hasMore = hasMore;
		this.nextCursor = nextCursor;
	}
}
