import { createMiddleware } from "hono/factory";
import { authService } from "./auth.service";
import { GeosearchErrorCode } from "../shared/geosearch-error-code.enum";
import { createGeosearchErrorResponse } from "../shared/geosearch-response.utils";
import type { IGeosearchHonoEnvironment } from "../shared/geosearch-hono-environment.interface";

export const geosearchAuthMiddleware = createMiddleware<IGeosearchHonoEnvironment>(async (context, next) => {
	const authorization = context.req.header("Authorization");
	const bearerMatch = authorization?.match(/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i);
	if (
		bearerMatch === undefined ||
		bearerMatch === null ||
		authorization === undefined ||
		authorization.length > 2_055
	) {
		return createGeosearchErrorResponse(context, {
			errorCode: GeosearchErrorCode.UNAUTHORIZED,
			message: "A valid geosearch bearer token is required.",
			status: 401,
		});
	}

	const accessToken = bearerMatch[1];
	if (accessToken === undefined) {
		return createGeosearchErrorResponse(context, {
			errorCode: GeosearchErrorCode.UNAUTHORIZED,
			message: "A valid geosearch bearer token is required.",
			status: 401,
		});
	}

	const authenticatedUserId = await authService.getAuthenticatedUserIdOrNull({
		accessToken: accessToken,
		microservicesAuthJwksUrl: context.env.MICROSERVICES_AUTH_JWKS_URL,
	});
	if (authenticatedUserId === null) {
		return createGeosearchErrorResponse(context, {
			errorCode: GeosearchErrorCode.UNAUTHORIZED,
			message: "A valid geosearch bearer token is required.",
			status: 401,
		});
	}

	context.set("authenticatedUserId", authenticatedUserId);
	return next();
});
