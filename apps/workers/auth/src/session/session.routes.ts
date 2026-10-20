import { Hono } from "hono";
import { validator } from "hono-openapi";
import { requireSession } from "../http/authentication.middleware";
import type { AuthContext } from "../http/context";
import { successResponse } from "../http/success-response";
import { validationHook } from "../http/validation.hook";
import { SessionService } from "../session/session.service";
import { RefreshTokenInputSchema } from "./refresh-token-input.schema";
import { getCurrentSessionDocs, logoutSessionDocs, refreshSessionDocs, revokeAllSessionsDocs } from "./session.openapi";

export const sessionRoutes = new Hono<AuthContext>()
	.get("/current", getCurrentSessionDocs, requireSession, (context) => {
		const session = context.get("session");

		return context.json(successResponse(context, session));
	})
	.post("/refresh", refreshSessionDocs, validator("json", RefreshTokenInputSchema, validationHook), async (context) => {
		const body = context.req.valid("json");

		return context.json(
			successResponse(
				context,
				await context.var.resolve(SessionService).refresh({ currentRefreshToken: body.refreshToken }),
			),
		);
	})
	.post("/logout", logoutSessionDocs, validator("json", RefreshTokenInputSchema, validationHook), async (context) => {
		const body = context.req.valid("json");
		await context.var.resolve(SessionService).logout({ refreshToken: body.refreshToken });
		return context.body(null, 204);
	})
	.delete("/", revokeAllSessionsDocs, requireSession, async (context) => {
		await context.var.resolve(SessionService).revokeAll({ session: context.get("session") });
		return context.body(null, 204);
	});
