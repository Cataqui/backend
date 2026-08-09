import { applyDecorators, HttpStatus, SerializeOptions } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ErrorOutputSchema } from "../../../core/errors/error-output";
import { createSuccessResponseSchema } from "../../../shared/schemas/success-response.schema";
import { SavedContactOutputSchema } from "../schemas/saved-contact-output.schema";

export function ApiAddContactDocs(): MethodDecorator & ClassDecorator {
	const responseSchema = createSuccessResponseSchema({ dataSchema: SavedContactOutputSchema });

	return applyDecorators(
		SerializeOptions({ schema: responseSchema }),
		ApiBearerAuth(),
		ApiOperation({
			summary: "Add a saved contact",
			description:
				"Adds an contact method to the authenticated user's reusable contacts for future job posts. Adding the same contact again returns the existing contact; changing a contact creates another one.",
		}),
		ApiResponse({
			status: HttpStatus.CREATED,
			description: "Contact saved for the authenticated user.",
			standardSchema: responseSchema,
		}),
		ApiResponse({
			status: HttpStatus.BAD_REQUEST,
			description: "The contact method or identifier is invalid.",
			standardSchema: ErrorOutputSchema,
		}),
		ApiResponse({
			status: HttpStatus.UNAUTHORIZED,
			description: "A valid bearer access token is required.",
			standardSchema: ErrorOutputSchema,
		}),
	);
}
