import { createMiddleware } from "hono/factory";
import { AuthService } from "../auth/auth.service";
import { AuthorizationInputSchema } from "../auth/authorization-input.schema";
import { AuthUnavailableError } from "../auth/errors/auth-unavailable.error";
import type { MapsContext } from "./context";
import { AccessTokenRequiredError } from "./errors/access-token-required.error";

export const requireAccount = createMiddleware<MapsContext>(async (context, next) => {
	const accessToken = AuthorizationInputSchema.safeParse(context.req.header("Authorization"));
	if (!accessToken.success) throw new AccessTokenRequiredError();

	let authenticatedAccountId: string | null;
	try {
		authenticatedAccountId = await context.var.resolve(AuthService).getAuthenticatedAccountIdOrNull({
			accessToken: accessToken.data,
		});
	} catch {
		throw new AuthUnavailableError();
	}
	if (authenticatedAccountId === null) throw new AccessTokenRequiredError();

	context.set("authenticatedAccountId", authenticatedAccountId);
	await next();
});
