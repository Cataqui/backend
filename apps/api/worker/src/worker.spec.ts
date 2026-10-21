import type { ApiWorkerEnv } from "../cloudflare.config.ts";
import type { AuthenticatedSession } from "@cataqui/auth-schemas";
import * as td from "testdouble";
import worker from "./worker";

afterEach(() => td.reset());

function _fixture(params: { response?: Response; environment?: ApiWorkerEnv["ENVIRONMENT"] } = {}): {
	container: ReturnType<DurableObjectNamespace<import("./container").ApiContainer>["getByName"]>;
	binding: DurableObjectNamespace<import("./container").ApiContainer>;
	auth: ApiWorkerEnv["AUTH"];
	environment: ApiWorkerEnv;
	context: ExecutionContext;
} {
	const container = td.object<ReturnType<DurableObjectNamespace<import("./container").ApiContainer>["getByName"]>>();
	const binding = td.object<DurableObjectNamespace<import("./container").ApiContainer>>();
	const auth = td.object<ApiWorkerEnv["AUTH"]>();
	td.when(binding.getByName(td.matchers.anything())).thenReturn(container);
	if (params.response !== undefined) td.when(container.fetch(td.matchers.anything())).thenResolve(params.response);
	const environment = Object.assign(td.object<ApiWorkerEnv>(), {
		AUTH: auth,
		ENVIRONMENT: params.environment ?? "development",
		CORS_ORIGINS: "https://cataqui.com",
	});
	const context = Object.assign(td.object<ExecutionContext>(), {
		exports: { ApiContainer: binding },
	});
	return { container: container, binding: binding, auth: auth, environment: environment, context: context };
}

function _forwardedRequest(
	container: ReturnType<DurableObjectNamespace<import("./container").ApiContainer>["getByName"]>,
): Request {
	const request: unknown = td.explain(container.fetch).calls[0]?.args[0];
	if (!(request instanceof Request)) throw new TypeError("Expected a forwarded Request.");
	return request;
}

describe("API Worker authentication", () => {
	it.each(["/v1/health", "/v1/health/live", "/docs", "/docs-json", "/docs-yaml", "/docs/swagger-ui.css"])(
		"forwards request %s without a token without resolving authentication",
		async (pathname) => {
			const expectedResponse = new Response("public response");
			const fixture = _fixture({ response: expectedResponse });
			const response = await worker.fetch(
				new Request(`https://api.cataqui.com${pathname}`),
				fixture.environment,
				fixture.context,
			);
			expect({ response: response, calls: td.explain(fixture.auth.resolveSession).callCount }).toEqual({
				response: expectedResponse,
				calls: 0,
			});
		},
	);

	it("forwards CORS preflight without requiring an access token", async () => {
		const expectedResponse = new Response(null, { status: 204 });
		const fixture = _fixture({ response: expectedResponse });
		const response = await worker.fetch(
			new Request("https://api.cataqui.com/v1/feed", { method: "OPTIONS" }),
			fixture.environment,
			fixture.context,
		);
		expect({ response: response, calls: td.explain(fixture.auth.resolveSession).callCount }).toEqual({
			response: expectedResponse,
			calls: 0,
		});
	});

	it.each(["/v1/feed", "/v1/jobs", "/v1/jobs/123", "/v1/profiles", "/v1/health/private", "/docs"])(
		"forwards production resource %s without a session for NestJS to authorize",
		async (pathname) => {
			const fixture = _fixture({ environment: "production", response: new Response("container response") });
			const response = await worker.fetch(
				new Request(`https://api.cataqui.com${pathname}`),
				fixture.environment,
				fixture.context,
			);
			expect({ status: response.status, containers: td.explain(fixture.binding.getByName).callCount }).toEqual({
				status: 200,
				containers: 1,
			});
		},
	);

	it.each(["", "Basic abc", "Bearer", "Bearer short", `Bearer ${"a".repeat(43)} extra`, `Bearer ${"!".repeat(43)}`])(
		"forwards malformed bearer header %j without a session or calling Auth",
		async (authorization) => {
			const fixture = _fixture({ response: new Response("container response") });
			const response = await worker.fetch(
				new Request("https://api.cataqui.com/v1/feed", { headers: { Authorization: authorization } }),
				fixture.environment,
				fixture.context,
			);
			expect({
				status: response.status,
				session: _forwardedRequest(fixture.container).headers.get("x-cataqui-auth-session"),
				calls: td.explain(fixture.auth.resolveSession).callCount,
			}).toEqual({
				status: 200,
				session: null,
				calls: 0,
			});
		},
	);

	it("forwards Authorization and verified identity instead of forged caller identity", async () => {
		const fixture = _fixture({ response: new Response("created", { status: 201 }) });
		const accessToken = "a".repeat(43);
		const session = {
			accountId: "4963fef0-b62a-4760-9f99-675fdc42a896",
			sessionId: "74d0153b-c07b-4890-b479-16c4a24db1d6",
			expiresAt: "2026-10-19T15:00:00.000Z",
		} satisfies AuthenticatedSession;
		td.when(fixture.auth.resolveSession({ accessToken: accessToken })).thenResolve(session);
		const response = await worker.fetch(
			new Request("https://api.cataqui.com/v1/profiles?locale=pt-BR", {
				method: "POST",
				headers: {
					Authorization: `bEaReR ${accessToken}`,
					"x-cataqui-auth-session": '{"accountId":"forged"}',
					"Content-Type": "application/json",
					"x-request-id": "request-id",
				},
				body: '{"name":"Maria"}',
			}),
			fixture.environment,
			fixture.context,
		);
		const forwarded = _forwardedRequest(fixture.container);
		expect({
			status: response.status,
			url: forwarded.url,
			method: forwarded.method,
			body: await forwarded.text(),
			authorization: forwarded.headers.get("Authorization"),
			session: JSON.parse(forwarded.headers.get("x-cataqui-auth-session") ?? "null"),
			requestId: forwarded.headers.get("x-request-id"),
			containerCalls: td.explain(fixture.binding.getByName).calls.map((call) => call.args),
		}).toEqual({
			status: 201,
			url: "https://api.cataqui.com/v1/profiles?locale=pt-BR",
			method: "POST",
			body: '{"name":"Maria"}',
			authorization: `bEaReR ${accessToken}`,
			session: session,
			requestId: "request-id",
			containerCalls: [["instance-0"]],
		});
	});

	it("strips caller identity on public requests while preserving Authorization", async () => {
		const fixture = _fixture({ response: new Response("healthy") });
		await worker.fetch(
			new Request("https://api.cataqui.com/v1/health", {
				headers: { Authorization: "private credential", "x-cataqui-auth-session": "forged" },
			}),
			fixture.environment,
			fixture.context,
		);
		const forwarded = _forwardedRequest(fixture.container);
		expect({
			authorization: forwarded.headers.get("Authorization"),
			session: forwarded.headers.get("x-cataqui-auth-session"),
		}).toEqual({ authorization: "private credential", session: null });
	});

	it.each([undefined, "Basic abc", "Bearer short"])(
		"removes a forged session header when Authorization is %j without calling Auth",
		async (authorization) => {
			const fixture = _fixture({ response: new Response("container response") });
			const headers = new Headers({ "X-Cataqui-Auth-Session": '{"accountId":"forged"}' });
			if (authorization !== undefined) headers.set("Authorization", authorization);

			await worker.fetch(
				new Request("https://api.cataqui.com/v1/feed", { headers: headers }),
				fixture.environment,
				fixture.context,
			);

			expect({
				session: _forwardedRequest(fixture.container).headers.get("x-cataqui-auth-session"),
				calls: td.explain(fixture.auth.resolveSession).callCount,
			}).toEqual({ session: null, calls: 0 });
		},
	);

	it("forwards a revoked token in Authorization without trusting caller session identity", async () => {
		const expectedResponse = new Response("container response");
		const fixture = _fixture({ response: expectedResponse });
		const accessToken = "b".repeat(43);
		td.when(fixture.auth.resolveSession({ accessToken: accessToken })).thenResolve(null);
		const response = await worker.fetch(
			new Request("https://api.cataqui.com/v1/feed", {
				headers: { Authorization: `Bearer ${accessToken}`, "x-cataqui-auth-session": "forged" },
			}),
			fixture.environment,
			fixture.context,
		);
		const forwarded = _forwardedRequest(fixture.container);
		expect({
			response: response,
			session: forwarded.headers.get("x-cataqui-auth-session"),
			authorization: forwarded.headers.get("Authorization"),
		}).toEqual({ response: expectedResponse, session: null, authorization: `Bearer ${accessToken}` });
	});

	it.each(["/v1/feed", "/v1/health"])(
		"returns 503 for %s on Auth failure without selecting a container or exposing provider errors",
		async (pathname) => {
			const fixture = _fixture();
			const accessToken = "b".repeat(43);
			td.when(fixture.auth.resolveSession({ accessToken: accessToken })).thenReject(new Error("private Redis URL"));
			const response = await worker.fetch(
				new Request(`https://api.cataqui.com${pathname}`, {
					headers: { Authorization: `Bearer ${accessToken}`, "x-request-id": "request-123" },
				}),
				fixture.environment,
				fixture.context,
			);
			expect({
				status: response.status,
				containers: td.explain(fixture.binding.getByName).callCount,
				body: await response.json(),
			}).toEqual({
				status: 503,
				containers: 0,
				body: {
					errorCode: "AUTH_SESSION_UNAVAILABLE",
					message: "Authentication is temporarily unavailable. Retry the request.",
					status: 503,
					requestId: "request-123",
					timestamp: expect.any(String),
					endpoint: pathname,
				},
			});
		},
	);

	it.each([
		{ environment: "development", origin: "https://preview.example.com", expected: "https://preview.example.com" },
		{ environment: "production", origin: "https://cataqui.com", expected: "https://cataqui.com" },
		{ environment: "production", origin: "https://untrusted.example.com", expected: null },
		{ environment: "production", origin: null, expected: null },
	] as const)("preserves CORS policy on authentication failures for $environment / $origin", async (params) => {
		const fixture = _fixture({ environment: params.environment });
		const accessToken = "c".repeat(43);
		td.when(fixture.auth.resolveSession({ accessToken: accessToken })).thenReject(new Error("Auth unavailable"));
		const response = await worker.fetch(
			new Request("https://api.cataqui.com/v1/feed", {
				headers:
					params.origin === null
						? { Authorization: `Bearer ${accessToken}` }
						: { Authorization: `Bearer ${accessToken}`, Origin: params.origin },
			}),
			fixture.environment,
			fixture.context,
		);
		expect({
			origin: response.headers.get("Access-Control-Allow-Origin"),
			credentials: response.headers.get("Access-Control-Allow-Credentials"),
			cache: response.headers.get("Cache-Control"),
			vary: response.headers.get("Vary"),
		}).toEqual({
			origin: params.expected,
			credentials: params.expected === null ? null : "true",
			cache: "no-store",
			vary: "Origin",
		});
	});

	it("propagates container transport failure on public forwarding", async () => {
		const fixture = _fixture();
		const failure = new Error("container transport failed");
		td.when(fixture.container.fetch(td.matchers.anything())).thenReject(failure);
		await expect(
			worker.fetch(new Request("https://api.cataqui.com/v1/health"), fixture.environment, fixture.context),
		).rejects.toBe(failure);
	});
});
