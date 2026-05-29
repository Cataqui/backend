import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import { PaginationOutputDto } from "./pagination-output.dto";

export class PaginatedResponseDto<T> {
	@Expose({ name: "data" })
	@ApiProperty({ name: "data", description: "Array of items for the current page" })
	readonly data: T[];

	@Expose({ name: "pagination" })
	@ApiProperty({ name: "pagination", description: "Pagination metadata", type: PaginationOutputDto })
	readonly pagination: PaginationOutputDto;

	constructor(data: T[], pagination: PaginationOutputDto) {
		this.data = data;
		this.pagination = pagination;
	}
}
