import { applyDecorators, HttpStatus, SerializeOptions } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ErrorOutputSchema } from "../../../../core/errors/error-output";
import { createSuccessResponseSchema } from "../../../../shared/schemas/success-response.schema";
import { MicroserviceAccessTokenOutputSchema } from "../schemas/microservice-access-token-output.schema";

export function ApiCreateGeosearchAccessTokenDocs(): MethodDecorator & ClassDecorator {
	const responseSchema = createSuccessResponseSchema({ dataSchema: MicroserviceAccessTokenOutputSchema });

	return applyDecorators(
		SerializeOptions({ schema: responseSchema }),
		ApiBearerAuth(),
		ApiOperation({
			summary: "Create a geosearch microservice access token",
			description: "Creates a short-lived bearer token for the geosearch service.",
		}),
		ApiResponse({
			status: HttpStatus.OK,
			description: "Geosearch access token created.",
			standardSchema: responseSchema,
		}),
		ApiResponse({
			status: HttpStatus.UNAUTHORIZED,
			description: "A valid bearer access token is required.",
			standardSchema: ErrorOutputSchema,
		}),
	);
}
