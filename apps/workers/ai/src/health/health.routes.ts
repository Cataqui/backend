import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import type { AiContext } from "../http/context";

export const healthRoutes = new Hono<AiContext>().get(
	"/",
	describeRoute({
		operationId: "getHealth",
		security: [],
		responses: { "204": { description: "Worker is reachable." } },
	}),
	(context) => context.body(null, 204),
);
