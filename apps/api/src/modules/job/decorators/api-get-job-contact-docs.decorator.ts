import { applyDecorators, HttpStatus, SerializeOptions } from "@nestjs/common";
import { ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ApiErrorResponseOutputSchema } from "../../../core/errors/api-error-response-output.schema";
import { createSuccessResponseSchema } from "@cataqui/response";
import { ContactOutputSchema } from "../../contact/schemas/contact-output.schema";

export function ApiGetJobContactDocs(): MethodDecorator & ClassDecorator {
	const responseSchema = createSuccessResponseSchema({ dataSchema: ContactOutputSchema });
	return applyDecorators(
		SerializeOptions({ schema: responseSchema }),
		ApiOperation({ summary: "Get an active job's contact details" }),
		ApiResponse({
			status: HttpStatus.OK,
			description: "Contact details for the active job.",
			standardSchema: responseSchema,
			headers: {
				"Cache-Control": {
					description: "Prevents storing the contact identifier.",
					schema: { type: "string", example: "no-store" },
				},
			},
		}),
		ApiResponse({
			status: "default",
			description: "Application error. Inspect status, errorCode, and any validation violations.",
			standardSchema: ApiErrorResponseOutputSchema,
		}),
		ApiResponse({
			status: HttpStatus.NOT_FOUND,
			description: "The job is unavailable or does not use this contact.",
			standardSchema: ApiErrorResponseOutputSchema,
		}),
	);
}
