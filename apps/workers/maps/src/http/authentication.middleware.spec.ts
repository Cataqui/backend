import type { MapsWorkerEnv } from "../../cloudflare.config.ts";
import { tsyringe } from "@hono/tsyringe";
import { Hono } from "hono";
import * as td from "testdouble";
import type { MapsContext } from "../http/context";
import { AuthService } from "../auth/auth.service";
import { requireAccount } from "./authentication.middleware";

import { createMapsErrorResponseFromError } from "./maps-error.handler";

const _authService = td.object<AuthService>();
afterEach(() => td.reset());

const app = new Hono<MapsContext>()
	.use("*", async (context, next) => {
		context.set("requestId", "request-1");
		await next();
	})
	.use(
		"*",
		tsyringe((scope) => {
			scope.registerInstance(AuthService, _authService);
		}),
	)
	.use("*", requireAccount)
	.get("/", (context) => context.json({ accountId: context.get("authenticatedAccountId") }))
	.onError((error, context) => createMapsErrorResponseFromError({ error: error, context: context }));
const accountId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

it.each([
	{ name: "missing authorization", authorization: undefined },
	{ name: "unsupported scheme", authorization: `Basic ${"a".repeat(43)}` },
	{ name: "missing token", authorization: "Bearer " },
	{ name: "short token", authorization: `Bearer ${"a".repeat(42)}` },
	{ name: "long token", authorization: `Bearer ${"a".repeat(44)}` },
	{ name: "JWT", authorization: "Bearer abc.def.ghi" },
	{ name: "invalid token encoding", authorization: `Bearer ${"a".repeat(42)}=` },
	{ name: "extra token", authorization: `Bearer ${"a".repeat(43)} another` },
])("rejects $name before attempting authentication", async ({ authorization }) => {
	const authenticate = _authService.getAuthenticatedAccountIdOrNull;
	const response = await app.request("/", {
		headers: authorization === undefined ? {} : { Authorization: authorization },
	});

	expect(response.status).toBe(401);
	expect(await response.json()).toMatchObject({
		errorCode: "UNAUTHORIZED",
		message: "A valid bearer token is required.",
	});
	expect(td.explain(authenticate).callCount).toBe(0);
});

it.each(["Bearer", "bearer", "BEARER"])("authenticates the opaque token using %s", async (scheme) => {
	const authenticate = _authService.getAuthenticatedAccountIdOrNull;
	const auth = td.object<MapsWorkerEnv["AUTH"]>();
	const token = "a_-".repeat(14) + "a";
	td.when(authenticate({ accessToken: token })).thenResolve(accountId);
	const response = await app.request("/", { headers: { Authorization: `${scheme} ${token}` } }, { AUTH: auth });

	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({ accountId: accountId });
	td.verify(authenticate({ accessToken: token }));
});

it("rejects invalid credentials", async () => {
	const authenticate = _authService.getAuthenticatedAccountIdOrNull;
	td.when(authenticate(td.matchers.anything())).thenResolve(null);
	const response = await app.request(
		"/",
		{ headers: { Authorization: `Bearer ${"a".repeat(43)}` } },
		{ AUTH: td.object<MapsWorkerEnv["AUTH"]>() },
	);

	expect(response.status).toBe(401);
	expect(await response.json()).toMatchObject({
		errorCode: "UNAUTHORIZED",
		message: "A valid bearer token is required.",
	});
});

it("reports an Auth outage separately and hides provider diagnostics", async () => {
	const authenticate = _authService.getAuthenticatedAccountIdOrNull;
	td.when(authenticate(td.matchers.anything())).thenReject(new Error("private Redis error"));
	const response = await app.request(
		"/",
		{ headers: { Authorization: `Bearer ${"a".repeat(43)}` } },
		{ AUTH: td.object<MapsWorkerEnv["AUTH"]>() },
	);

	expect(response.status).toBe(503);
	expect(await response.json()).toEqual({
		status: expect.any(Number),
		requestId: expect.any(String),
		timestamp: expect.any(String),
		endpoint: expect.any(String),
		errorCode: "AUTH_UNAVAILABLE",
		message: "Authentication is temporarily unavailable.",
	});
});
