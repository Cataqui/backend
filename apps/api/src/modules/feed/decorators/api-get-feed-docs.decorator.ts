import { applyDecorators, HttpStatus, SerializeOptions } from "@nestjs/common";
import { ApiOperation, ApiResponse } from "@nestjs/swagger";
import { createPaginatedSuccessResponseSchema } from "@cataqui/response";
import { ApiErrorResponseOutputSchema } from "../../../core/errors/api-error-response-output.schema";
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
			status: "default",
			description: "Application error. Inspect status, errorCode, and any validation violations.",
			standardSchema: ApiErrorResponseOutputSchema,
		}),
	);
}
