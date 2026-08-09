import { applyDecorators, HttpStatus, SerializeOptions } from "@nestjs/common";
import { ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ErrorOutputSchema } from "../../../../core/errors/error-output";
import { createSuccessResponseSchema } from "../../../../shared/schemas/success-response.schema";
import { InboundMessageAuthIntentOutputSchema } from "../schemas/inbound-message-auth-intent-output.schema";

export function ApiCreateInboundMessageAuthIntentDocs(): MethodDecorator & ClassDecorator {
	const responseSchema = createSuccessResponseSchema({ dataSchema: InboundMessageAuthIntentOutputSchema });

	return applyDecorators(
		SerializeOptions({ schema: responseSchema }),
		ApiOperation({
			summary: "Create an inbound-message authentication intent",
			description:
				"Creates a short-lived authentication code and secret intent token for the requested messaging channel. The Cataquí mobile client asks the user to send the code through that channel and keeps the intent token private for polling. An unused intent expires after 15 minutes; after message verification, the token remains exchangeable for five minutes.",
		}),
		ApiResponse({
			status: HttpStatus.CREATED,
			description: "Inbound-message authentication intent created.",
			standardSchema: responseSchema,
			headers: {
				"Cache-Control": {
					description: "Prevents caches from storing the authentication code.",
					schema: { type: "string", example: "no-store" },
				},
			},
		}),
		ApiResponse({
			status: HttpStatus.SERVICE_UNAVAILABLE,
			description:
				"Every generated authentication credential set conflicted with an active intent. The caller should try again.",
			standardSchema: ErrorOutputSchema,
		}),
	);
}
