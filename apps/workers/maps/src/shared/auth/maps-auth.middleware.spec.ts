import { Hono } from "hono";
import type { IMapsHonoEnvironment } from "../maps-hono-environment.interface";
import { authService } from "./auth.service";
import { mapsAuthMiddleware } from "./maps-auth.middleware";

const app = new Hono<IMapsHonoEnvironment>()
	.use("*", mapsAuthMiddleware)
	.get("/", (context) => context.json({ userId: context.get("authenticatedUserId") }));
const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const jwksUrl = "https://api.cataqui.test/v1/auth/microservices/jwks";

describe("mapsAuthMiddleware", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it.each([
		{ name: "missing authorization", authorization: undefined },
		{ name: "unsupported scheme", authorization: "Basic abc.def.ghi" },
		{ name: "missing token segment", authorization: "Bearer abc.def" },
		{ name: "extra token segment", authorization: "Bearer abc.def.ghi.jkl" },
		{ name: "empty token segment", authorization: "Bearer .def.ghi" },
		{ name: "invalid token encoding", authorization: "Bearer abc.def.ghi=" },
		{ name: "oversized token", authorization: `Bearer ${"a".repeat(2_045)}.b.c` },
	])("should reject $name before attempting authentication", async ({ authorization }) => {
		const authenticate = vi.spyOn(authService, "getAuthenticatedUserIdOrNull");
		const response = await app.request("/", {
			headers: authorization === undefined ? {} : { Authorization: authorization },
		});

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			errorCode: "UNAUTHORIZED",
			message: "A valid maps bearer token is required.",
		});
		expect(authenticate).not.toHaveBeenCalled();
	});

	it.each([
		{ scheme: "Bearer", token: "abc.def.ghi" },
		{ scheme: "bearer", token: "abc.def.ghi" },
		{ scheme: "BEARER", token: "abc.def.ghi" },
		{ scheme: "Bearer", token: `${"a".repeat(2_044)}.b.c` },
	])("should authenticate a valid $scheme header within the size limit", async ({ scheme, token }) => {
		const authenticate = vi.spyOn(authService, "getAuthenticatedUserIdOrNull").mockResolvedValue(userId);
		const response = await app.request(
			"/",
			{ headers: { Authorization: `${scheme} ${token}` } },
			{ MICROSERVICES_AUTH_JWKS_URL: jwksUrl },
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ userId: userId });
		expect(authenticate).toHaveBeenCalledExactlyOnceWith({
			accessToken: token,
			microservicesAuthJwksUrl: jwksUrl,
		});
	});

	it("should reject a well-formed bearer token when authentication fails", async () => {
		vi.spyOn(authService, "getAuthenticatedUserIdOrNull").mockResolvedValue(null);
		const response = await app.request(
			"/",
			{ headers: { Authorization: "Bearer abc.def.ghi" } },
			{ MICROSERVICES_AUTH_JWKS_URL: jwksUrl },
		);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			errorCode: "UNAUTHORIZED",
			message: "A valid maps bearer token is required.",
		});
	});
});
