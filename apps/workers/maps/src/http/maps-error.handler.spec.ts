import { MapsErrorCode } from "../errors/maps-error-code.enum";
import { PlaceProviderUnavailableError } from "../places/errors/place-provider-unavailable.error";
import { PlaceProviderTimeoutError } from "../places/errors/place-provider-timeout.error";
import { PlaceProviderResponseInvalidError } from "../places/errors/place-provider-response-invalid.error";
import { PlaceSearchRateLimitedError } from "../places/errors/place-search-rate-limited.error";
import { PlaceDetailsRateLimitedError } from "../places/errors/place-details-rate-limited.error";
import { AccessTokenRequiredError } from "./errors/access-token-required.error";
import { AuthUnavailableError } from "../auth/errors/auth-unavailable.error";
import * as td from "testdouble";
import { Hono } from "hono";
import type { MapsContext } from "./context";
import { createMapsErrorResponseFromError } from "./maps-error.handler";

afterEach(() => td.reset());

it("omits the signed location reference from unexpected-error logs", async () => {
	const app = new Hono<MapsContext>();
	app.use("*", async (context, next) => {
		context.set("requestId", "request-1");
		await next();
	});
	const errorLog = td.replace(console, "error");
	app.get("/static/v1/:reference/:camera/:viewport/:raster/:encoding", (context) => {
		context.set("requestId", "request-1");
		throw new Error("private renderer diagnostic");
	});
	app.onError((error, context) => createMapsErrorResponseFromError({ error: error, context: context }));
	const response = await app.request("/static/v1/private-location-reference/z12/w360-h960/p480/image.webp");
	expect(response.status).toBe(500);
	td.verify(
		errorLog(
			td.matchers.contains({
				path: "/static/v1/:reference/:camera/:viewport/:raster/:encoding",
			}),
		),
	);
	expect(JSON.stringify(td.explain(errorLog).calls.map((call) => call.args))).not.toContain(
		"private-location-reference",
	);
	expect(JSON.stringify(td.explain(errorLog).calls.map((call) => call.args))).not.toContain(
		"private renderer diagnostic",
	);
});

it.each([
	{ error: new PlaceProviderUnavailableError(), status: 502, errorCode: MapsErrorCode.PROVIDER_UNAVAILABLE },
	{ error: new PlaceProviderTimeoutError(), status: 504, errorCode: MapsErrorCode.PROVIDER_UNAVAILABLE },
	{ error: new PlaceProviderResponseInvalidError(), status: 502, errorCode: MapsErrorCode.PROVIDER_UNAVAILABLE },
	{ error: new PlaceSearchRateLimitedError(), status: 429, errorCode: MapsErrorCode.RATE_LIMITED, retryAfter: "60" },
	{ error: new PlaceDetailsRateLimitedError(), status: 429, errorCode: MapsErrorCode.RATE_LIMITED, retryAfter: "60" },
	{ error: new AccessTokenRequiredError(), status: 401, errorCode: MapsErrorCode.UNAUTHORIZED },
	{ error: new AuthUnavailableError(), status: 503, errorCode: MapsErrorCode.AUTH_UNAVAILABLE },
])("presents $error.name with the owning HTTP contract", async ({ error, status, errorCode, retryAfter }) => {
	const app = new Hono<MapsContext>();
	app.use("*", async (context, next) => {
		context.set("requestId", "request-1");
		await next();
	});
	app.get("/", () => {
		throw error;
	});
	app.onError((error, context) => createMapsErrorResponseFromError({ error: error, context: context }));

	const response = await app.request("/");

	expect(response.status).toBe(status);
	expect(await response.json()).toMatchObject({ errorCode: errorCode, status: status, message: error.message });
	expect(response.headers.get("Retry-After")).toBe(retryAfter ?? null);
});
