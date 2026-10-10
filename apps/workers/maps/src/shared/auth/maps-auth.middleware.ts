import { createMiddleware } from "hono/factory";
import { authService } from "./auth.service";
import { MapsErrorCode } from "../maps-error-code.enum";
import { createMapsErrorResponse } from "../maps-error.response";
import type { IMapsHonoEnvironment } from "../maps-hono-environment.interface";

export const mapsAuthMiddleware = createMiddleware<IMapsHonoEnvironment>(async (context, next) => {
	const authorization = context.req.header("Authorization");
	const accessToken =
		authorization !== undefined && authorization.length <= 2_055
			? /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(authorization)?.[1]
			: undefined;
	if (accessToken === undefined) {
		return createMapsErrorResponse({
			context: context,
			errorCode: MapsErrorCode.UNAUTHORIZED,
			message: "A valid maps bearer token is required.",
			status: 401,
		});
	}

	const authenticatedUserId = await authService.getAuthenticatedUserIdOrNull({
		accessToken: accessToken,
		microservicesAuthJwksUrl: context.env.MICROSERVICES_AUTH_JWKS_URL,
	});
	if (authenticatedUserId === null) {
		return createMapsErrorResponse({
			context: context,
			errorCode: MapsErrorCode.UNAUTHORIZED,
			message: "A valid maps bearer token is required.",
			status: 401,
		});
	}

	context.set("authenticatedUserId", authenticatedUserId);
	return next();
});
