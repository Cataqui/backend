import { applyDecorators, HttpStatus, SerializeOptions } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ErrorOutputSchema } from "../../../core/errors/error-output";
import { createSuccessResponseSchema } from "../../../shared/schemas/success-response.schema";
import { UserJobOutputSchema } from "../../job/schemas/user-job-output.schema";

export function ApiGetCurrentUserJobDocs(): MethodDecorator & ClassDecorator {
	const responseSchema = createSuccessResponseSchema({ dataSchema: UserJobOutputSchema });
	return applyDecorators(
		SerializeOptions({ schema: responseSchema }),
		ApiBearerAuth(),
		ApiOperation({ summary: "Get one of the authenticated user's posted jobs" }),
		ApiResponse({ status: HttpStatus.OK, description: "Posted job returned.", standardSchema: responseSchema }),
		ApiResponse({
			status: HttpStatus.BAD_REQUEST,
			description: "Invalid job ID.",
			standardSchema: ErrorOutputSchema,
		}),
		ApiResponse({
			status: HttpStatus.UNAUTHORIZED,
			description: "A valid bearer access token is required.",
			standardSchema: ErrorOutputSchema,
		}),
		ApiResponse({
			status: HttpStatus.NOT_FOUND,
			description: "No job owned by the authenticated user exists with the supplied job ID.",
			standardSchema: ErrorOutputSchema,
		}),
	);
}
