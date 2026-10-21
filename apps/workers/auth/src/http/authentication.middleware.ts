import { createMiddleware } from "hono/factory";
import { SessionService } from "../session/session.service";
import type { AuthContext } from "./context";
import { AccessTokenRequiredError } from "./errors/access-token-required.error";

export const requireSession = createMiddleware<AuthContext>(async (context, next) => {
	const authorization = context.req.header("Authorization");
	const accessToken = authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/i)?.[1];
	const session =
		accessToken === undefined
			? null
			: await context.var.resolve(SessionService).getActiveSessionFromAccessTokenOrNull({ accessToken: accessToken });
	if (session === null) throw new AccessTokenRequiredError();
	context.set("session", session);
	await next();
});
