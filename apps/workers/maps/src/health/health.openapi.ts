import { describeRoute } from "hono-openapi";
export const checkHealthDocs = describeRoute({
	summary: "Check Worker health",
	security: [],
	responses: { "204": { description: "Healthy; Cache-Control: no-store." } },
});
