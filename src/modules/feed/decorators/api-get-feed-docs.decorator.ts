import { HttpStatus, applyDecorators } from "@nestjs/common";
import { ApiOperation, ApiResponse } from "@nestjs/swagger";
import { FeedItemOutputDto } from "../dto/feed-item-output.dto";

export function ApiGetFeedDocs(): MethodDecorator & ClassDecorator {
	return applyDecorators(
		ApiOperation({ summary: "Get feed of active jobs", description: "Returns a paginated feed of active jobs. Supports cursor-based pagination and sort modes." }),
		ApiResponse({
			status: HttpStatus.OK,
			description: "Feed items retrieved successfully",
			type: FeedItemOutputDto,
			isArray: true,
		}),
		ApiResponse({
			status: HttpStatus.BAD_REQUEST,
			description: "Invalid cursor or query parameters",
		}),
	);
}
