import { applyDecorators, HttpStatus, SerializeOptions } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ErrorOutputSchema } from "../../../core/errors/error-output";
import { createSuccessResponseSchema } from "../../../shared/schemas/success-response.schema";
import { AuthSessionOutputSchema } from "../schemas/auth-session-output.schema";
import { CurrentAuthSessionOutputSchema } from "../schemas/current-auth-session-output.schema";

export function ApiRefreshAuthSessionDocs(): MethodDecorator & ClassDecorator {
	const responseSchema = createSuccessResponseSchema({ dataSchema: AuthSessionOutputSchema });

	return applyDecorators(
		SerializeOptions({ schema: responseSchema }),
		ApiOperation({ summary: "Rotate a refresh token and issue a new access-token pair" }),
		ApiResponse({
			status: HttpStatus.OK,
			standardSchema: responseSchema,
		}),
		ApiResponse({
			status: HttpStatus.UNAUTHORIZED,
			description: "The refresh token is invalid, expired, revoked, or already used.",
			standardSchema: ErrorOutputSchema,
		}),
		ApiResponse({ status: HttpStatus.SERVICE_UNAVAILABLE, standardSchema: ErrorOutputSchema }),
	);
}

export function ApiGetCurrentAuthSessionDocs(): MethodDecorator & ClassDecorator {
	const responseSchema = createSuccessResponseSchema({ dataSchema: CurrentAuthSessionOutputSchema });

	return applyDecorators(
		SerializeOptions({ schema: responseSchema }),
		ApiOperation({ summary: "Get the current Cataquí session" }),
		ApiResponse({
			status: HttpStatus.OK,
			standardSchema: responseSchema,
		}),
		ApiResponse({ status: HttpStatus.UNAUTHORIZED, standardSchema: ErrorOutputSchema }),
	);
}

export function ApiLogoutCurrentAuthSessionDocs(): MethodDecorator & ClassDecorator {
	return applyDecorators(
		ApiOperation({ summary: "Log out the device session represented by a refresh token" }),
		ApiResponse({
			status: HttpStatus.NO_CONTENT,
			description: "The session was revoked, or the refresh token was already invalid.",
		}),
		ApiResponse({ status: HttpStatus.BAD_REQUEST, standardSchema: ErrorOutputSchema }),
		ApiResponse({ status: HttpStatus.SERVICE_UNAVAILABLE, standardSchema: ErrorOutputSchema }),
	);
}

export function ApiRevokeAllAuthSessionsDocs(): MethodDecorator & ClassDecorator {
	return applyDecorators(
		ApiBearerAuth(),
		ApiOperation({ summary: "Revoke every session for the current Cataquí user" }),
		ApiResponse({ status: HttpStatus.NO_CONTENT, description: "All sessions for the user were revoked." }),
		ApiResponse({ status: HttpStatus.UNAUTHORIZED, standardSchema: ErrorOutputSchema }),
	);
}
