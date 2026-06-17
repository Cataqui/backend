import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import { PaginationOutputDto } from "./pagination-output.dto";
import { SuccessResponseDto } from "./success-response.dto";

export class PaginatedSuccessResponseDto<T> extends SuccessResponseDto<T[]> {
	@Expose({ name: "pagination" })
	@ApiProperty({ name: "pagination", description: "Pagination metadata", type: PaginationOutputDto })
	readonly pagination: PaginationOutputDto;

	constructor(data: T[], pagination: PaginationOutputDto, requestId: string, timestamp: string, endpoint: string) {
		super(data, requestId, timestamp, endpoint);
		this.pagination = pagination;
	}
}
