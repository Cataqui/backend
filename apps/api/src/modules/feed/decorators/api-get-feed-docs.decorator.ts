import { applyDecorators, HttpStatus, SerializeOptions } from "@nestjs/common";
import { ApiOperation, ApiResponse } from "@nestjs/swagger";
import { createPaginatedSuccessResponseSchema } from "../../../shared/schemas/paginated-success-response.schema";
import { FeedItemOutputSchema } from "../schemas/feed-item-output.schema";

export function ApiGetFeedDocs(): MethodDecorator & ClassDecorator {
	const responseSchema = createPaginatedSuccessResponseSchema({ itemSchema: FeedItemOutputSchema });

	return applyDecorators(
		SerializeOptions({ schema: responseSchema }),
		ApiOperation({
			summary: "Get feed of active jobs",
			description: "Returns a cursor-paginated feed of active jobs in the server-defined order.",
		}),
		ApiResponse({
			status: HttpStatus.OK,
			description: "Feed items retrieved successfully",
			standardSchema: responseSchema,
		}),
		ApiResponse({
			status: HttpStatus.BAD_REQUEST,
			description: "Invalid cursor or query parameters",
		}),
	);
}
