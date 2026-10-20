import type { ApiWorkerEnv } from "../cloudflare.config.ts";
import type { AuthenticatedSession } from "@cataqui/auth-schemas";
import { ApiWorkerErrorResponseOutputSchema } from "./http/api-worker-error-response-output.schema";

import { ApiWorkerErrorCode } from "./http/api-worker-error-code.enum";

export { ApiContainer } from "./container";
export { ApiWorkerPortal } from "./worker-portal";

const worker = {
	async fetch(request: Request, env: ApiWorkerEnv, context: ExecutionContext): Promise<Response> {
		const authenticatedSessionHeader = "x-cataqui-auth-session";
		const headers = new Headers(request.headers);

		headers.delete(authenticatedSessionHeader);

		const authorization = request.headers.get("Authorization")?.trim().split(/\s+/);
		const accessToken = authorization?.[1];

		const isBearerToken =
			authorization?.length === 2 &&
			authorization[0]?.toLowerCase() === "bearer" &&
			typeof accessToken === "string" &&
			/^[A-Za-z0-9_-]{43}$/.test(accessToken);

		if (isBearerToken) {
			let resolved: Awaited<ReturnType<ApiWorkerEnv["AUTH"]["resolveSession"]>>;

			try {
				resolved = await env.AUTH.resolveSession({ accessToken: accessToken });
			} catch {
				const responseHeaders = new Headers({ "Cache-Control": "no-store", Vary: "Origin" });
				const origin = request.headers.get("Origin");
				const isAllowedOrigin =
					env.ENVIRONMENT === "development" || env.CORS_ORIGINS.split(",").some((allowed) => allowed.trim() === origin);

				if (origin !== null && isAllowedOrigin) {
					responseHeaders.set("Access-Control-Allow-Origin", origin);
					responseHeaders.set("Access-Control-Allow-Credentials", "true");
				}

				return Response.json(
					ApiWorkerErrorResponseOutputSchema.parse({
						errorCode: ApiWorkerErrorCode.AUTH_SESSION_UNAVAILABLE,
						message: "Authentication is temporarily unavailable. Retry the request.",
						status: 503,
						requestId: request.headers.get("x-request-id") || crypto.randomUUID(),
						timestamp: new Date().toISOString(),
						endpoint: new URL(request.url).pathname,
					}),
					{ status: 503, headers: responseHeaders },
				);
			}

			if (resolved !== null) {
				const session = {
					accountId: resolved.accountId,
					sessionId: resolved.sessionId,
					expiresAt: resolved.expiresAt,
				} satisfies AuthenticatedSession;
				headers.set(authenticatedSessionHeader, JSON.stringify(session));
			}
		}
		return context.exports.ApiContainer.getByName("instance-0").fetch(new Request(request, { headers: headers }));
	},
} satisfies ExportedHandler<ApiWorkerEnv>;

export default worker;
