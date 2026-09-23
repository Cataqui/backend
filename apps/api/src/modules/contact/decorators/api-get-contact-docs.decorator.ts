import { applyDecorators, HttpStatus, SerializeOptions } from "@nestjs/common";
import { ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ErrorOutputSchema } from "../../../core/errors/error-output";
import { createSuccessResponseSchema } from "../../../shared/schemas/success-response.schema";
import { ContactOutputSchema } from "../schemas/contact-output.schema";

export function ApiGetContactDocs(): MethodDecorator & ClassDecorator {
	const responseSchema = createSuccessResponseSchema({ dataSchema: ContactOutputSchema });

	return applyDecorators(
		SerializeOptions({ schema: responseSchema }),
		ApiOperation({ summary: "Get contact details by ID" }),
		ApiResponse({
			status: HttpStatus.OK,
			description: "Contact found",
			headers: {
				"Cache-Control": {
					description: "Prevents caches from storing the contact identifier.",
					schema: { type: "string", example: "no-store" },
				},
			},
			standardSchema: responseSchema,
		}),
		ApiResponse({
			status: HttpStatus.BAD_REQUEST,
			description: "The contact ID is invalid.",
			standardSchema: ErrorOutputSchema,
		}),
		ApiResponse({
			status: HttpStatus.NOT_FOUND,
			description: "The contact does not exist.",
			standardSchema: ErrorOutputSchema,
		}),
	);
}
