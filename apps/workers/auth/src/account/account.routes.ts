import { Hono } from "hono";
import { AccountService } from "../account/account.service";
import { requireSession } from "../http/authentication.middleware";
import type { AuthContext } from "../http/context";
import { successResponse } from "../http/success-response";
import { getCurrentAccountDocs } from "./account.openapi";

export const accountRoutes = new Hono<AuthContext>().get("/", getCurrentAccountDocs, requireSession, async (context) =>
	context.json(
		successResponse(
			context,
			await context.var.resolve(AccountService).getCurrent({ accountId: context.get("session").accountId }),
		),
	),
);
