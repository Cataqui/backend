import { Hono } from "hono";
import { HealthService } from "../health/health.service";
import type { AuthContext } from "../http/context";
import { AuthNotReadyError } from "./errors/auth-not-ready.error";
import { checkLivenessDocs, checkReadinessDocs } from "./health.openapi";

export const healthRoutes = new Hono<AuthContext>()
	.get("/live", checkLivenessDocs, (context) => context.body(null, 204))
	.get("/", checkReadinessDocs, async (context) => {
		const ready = await context.var.resolve(HealthService).check();
		if (!ready) throw new AuthNotReadyError();
		return context.json({ status: "ok" }, 200);
	});
