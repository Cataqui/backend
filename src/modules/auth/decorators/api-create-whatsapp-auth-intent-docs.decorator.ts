import { applyDecorators, HttpStatus } from "@nestjs/common";
import { ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ErrorOutputDto } from "../../../core/errors/error-output.dto";
import { WhatsappAuthIntentOutputDto } from "../dto/whatsapp-auth-intent-output.dto";

export function ApiCreateWhatsappAuthIntentDocs(): MethodDecorator & ClassDecorator {
	return applyDecorators(
		ApiOperation({
			summary: "Create a WhatsApp authentication intent",
			description:
				"Creates a short-lived authentication code for a Cataquí frontend to place in a user-initiated WhatsApp message. The endpoint is open, does not send a WhatsApp message, and the returned code expires after 15 minutes.",
		}),
		ApiResponse({
			status: HttpStatus.CREATED,
			description: "WhatsApp authentication intent created.",
			type: WhatsappAuthIntentOutputDto,
			headers: {
				"Cache-Control": {
					description: "Prevents caches from storing the authentication code.",
					schema: { type: "string", example: "no-store" },
				},
			},
		}),
		ApiResponse({
			status: HttpStatus.TOO_MANY_REQUESTS,
			description: "The caller exceeded five authentication intent requests within one minute.",
			type: ErrorOutputDto,
		}),
		ApiResponse({
			status: HttpStatus.SERVICE_UNAVAILABLE,
			description: "The authentication intent could not be stored safely. The caller should try again.",
			type: ErrorOutputDto,
		}),
	);
}
