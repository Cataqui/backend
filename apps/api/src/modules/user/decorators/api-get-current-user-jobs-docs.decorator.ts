import { applyDecorators, HttpStatus, SerializeOptions } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ErrorOutputSchema } from "../../../core/errors/error-output";
import { createPaginatedSuccessResponseSchema } from "../../../shared/schemas/paginated-success-response.schema";
import { UserJobOutputSchema } from "../../job/schemas/user-job-output.schema";

export function ApiGetCurrentUserJobsDocs(): MethodDecorator & ClassDecorator {
	const responseSchema = createPaginatedSuccessResponseSchema({ itemSchema: UserJobOutputSchema });
	return applyDecorators(
		SerializeOptions({ schema: responseSchema }),
		ApiBearerAuth(),
		ApiOperation({
			summary: "Get the authenticated user's posted jobs",
			description: "Returns active and archived jobs in newest-first order.",
		}),
		ApiResponse({ status: HttpStatus.OK, description: "Posted jobs returned.", standardSchema: responseSchema }),
		ApiResponse({
			status: HttpStatus.BAD_REQUEST,
			description: "Invalid cursor or query parameters.",
			standardSchema: ErrorOutputSchema,
		}),
		ApiResponse({
			status: HttpStatus.UNAUTHORIZED,
			description: "A valid bearer access token is required.",
			standardSchema: ErrorOutputSchema,
		}),
	);
}
