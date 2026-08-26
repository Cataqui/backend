import { applyDecorators, HttpStatus, SerializeOptions } from "@nestjs/common";
import { ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ErrorOutputSchema } from "../../../../core/errors/error-output";
import { createSuccessResponseSchema } from "../../../../shared/schemas/success-response.schema";
import { AuthSessionOutputSchema } from "../../schemas/auth-session-output.schema";
import { NotpConstants } from "../notp.constants";
import { NotpIntentExchangeOutputSchema } from "../schemas/notp-intent-exchange-output.schema";
import { NotpIntentPendingOutputSchema } from "../schemas/notp-intent-pending-output.schema";

export function ApiExchangeNotpIntentDocs(): MethodDecorator & ClassDecorator {
	return applyDecorators(
		SerializeOptions({ schema: createSuccessResponseSchema({ dataSchema: NotpIntentExchangeOutputSchema }) }),
		ApiOperation({
			summary: "Poll and exchange an NOTP intent",
			description:
				"Poll with the secret returned when the intent was created. Pending intents return 202. A verified intent returns or rotates one device session with a short-lived access token and rotating refresh token, then returns 201.",
		}),
		ApiResponse({
			status: HttpStatus.ACCEPTED,
			description: "The NOTP message has not verified the intent yet.",
			standardSchema: createSuccessResponseSchema({ dataSchema: NotpIntentPendingOutputSchema }),
			headers: {
				"Retry-After": {
					description: "Seconds the client should wait before polling this endpoint again.",
					schema: { type: "integer", example: NotpConstants.INTENT_EXCHANGE_POLL_RETRY_SECONDS },
				},
			},
		}),
		ApiResponse({
			status: HttpStatus.CREATED,
			description: "The verified intent was exchanged for a bearer session.",
			standardSchema: createSuccessResponseSchema({ dataSchema: AuthSessionOutputSchema }),
		}),
		ApiResponse({
			status: HttpStatus.NOT_FOUND,
			description: "The intent token is unknown or expired.",
			standardSchema: ErrorOutputSchema,
		}),
		ApiResponse({
			status: HttpStatus.SERVICE_UNAVAILABLE,
			description: "The durable session could not be created safely.",
			standardSchema: ErrorOutputSchema,
		}),
	);
}
