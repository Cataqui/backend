import { applyDecorators, HttpStatus, SerializeOptions } from "@nestjs/common";
import { ApiOperation, ApiResponse } from "@nestjs/swagger";
import { createSuccessResponseSchema } from "../../../shared/schemas/success-response.schema";
import { JobContactOutputSchema } from "../schemas/job-contact-output.schema";

export function ApiGetJobContactDocs(): MethodDecorator & ClassDecorator {
	const responseSchema = createSuccessResponseSchema({ dataSchema: JobContactOutputSchema });

	return applyDecorators(
		SerializeOptions({ schema: responseSchema }),
		ApiOperation({ summary: "Get full contact details for an active job contact by id" }),
		ApiResponse({
			status: HttpStatus.OK,
			description: "Active job contact found",
			headers: {
				"Cache-Control": {
					description: "Prevents caches from storing the job contact's phone number.",
					schema: { type: "string", example: "no-store" },
				},
			},
			standardSchema: responseSchema,
		}),
		ApiResponse({
			status: HttpStatus.NOT_FOUND,
			description: "The job is not active or the supplied job and contact IDs do not identify the same contact.",
		}),
	);
}
