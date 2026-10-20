import type { MapsWorkerEnv } from "../../cloudflare.config.ts";
import { tsyringe } from "@hono/tsyringe";
import * as td from "testdouble";
import { Hono } from "hono";
import { AuthService } from "../auth/auth.service";
import { createMapsErrorResponseFromError } from "../http/maps-error.handler";
import { MapsErrorCode } from "../errors/maps-error-code.enum";
import type { MapsContext } from "../http/context";
import { PlaceDetailsRateLimitedError } from "./errors/place-details-rate-limited.error";
import { PlaceProviderResponseInvalidError } from "./errors/place-provider-response-invalid.error";
import { PlaceProviderTimeoutError } from "./errors/place-provider-timeout.error";
import { PlaceProviderUnavailableError } from "./errors/place-provider-unavailable.error";
import { PlaceSearchRateLimitedError } from "./errors/place-search-rate-limited.error";
import type { PlaceDetailsOutput } from "./place-details-output.schema";
import { placesRoutes } from "./places.routes";
import { PlacesService } from "./places.service";
import type { PlaceSearchOutput } from "./place-search-output.schema";

let _authService: AuthService;
let _app: Hono<MapsContext>;
let _service: PlacesService;
let _environment: MapsWorkerEnv;
beforeEach(() => {
	_service = td.object<PlacesService>();
	_environment = td.object<MapsWorkerEnv>();
	_environment.ENVIRONMENT = "development";
	_authService = td.object<AuthService>();
	_app = new Hono<MapsContext>();
	_app.use("*", async (context, next) => {
		context.set("requestId", "request-1");
		await next();
	});
	_app.use(
		"*",
		tsyringe((scope) => {
			scope.registerInstance(AuthService, _authService);
			scope.registerInstance(PlacesService, _service);
		}),
	);
	_app.route("/places", placesRoutes);
	_app.onError((error, context) => createMapsErrorResponseFromError({ context: context, error: error }));
});
afterEach(() => td.reset());

function _request(params: {
	path?: string;
	body?: string | Record<string, unknown>;
	language?: string | undefined;
	method?: string;
}): Request {
	return new Request(`https://maps.cataqui.com${params.path ?? "/places/search"}`, {
		method: params.method ?? "QUERY",
		headers: {
			Authorization: `Bearer ${"a".repeat(43)}`,
			"Content-Type": "application/json",
			...(params.language === undefined ? {} : { "Accept-Language": params.language }),
		},
		body:
			typeof params.body === "string"
				? params.body
				: JSON.stringify(params.body ?? { query: "Place", sessionToken: "session" }),
	});
}

it("passes normalized search input, locale and account usage key to its service", async () => {
	td.when(_authService.getAuthenticatedAccountIdOrNull(td.matchers.anything())).thenResolve("account-1");
	const output = {
		suggestions: [
			{
				placeId: "place-1",
				fullText: "Rua Augusta, São Paulo",
				primaryText: "Rua Augusta",
				secondaryText: "São Paulo",
				category: "STREET",
			},
		],
		attribution: { text: "Google Maps" },
	} satisfies PlaceSearchOutput;
	td.when(_service.searchPlaces(td.matchers.anything())).thenResolve(output);
	const response = await _app.fetch(
		_request({ body: { query: "  Rua Augusta  ", sessionToken: "session-1" }, language: "pt-br, en;q=0.8" }),
		_environment,
	);
	expect({
		status: response.status,
		output: await response.json(),
		serviceCalls: td.explain(_service.searchPlaces).calls.map((call) => call.args),
	}).toEqual({
		status: 200,
		output: {
			data: output,
			requestId: "request-1",
			timestamp: expect.any(String),
			endpoint: expect.stringMatching(/^\/places\/(search|details)$/),
		},
		serviceCalls: [
			[
				{
					input: { query: "Rua Augusta", sessionToken: "session-1" },
					languageCode: "pt-BR",
					rateLimitKey: "development:account-1",
				},
			],
		],
	});
});

it("passes selected place details and account usage key to its service", async () => {
	td.when(_authService.getAuthenticatedAccountIdOrNull(td.matchers.anything())).thenResolve("account-2");
	const output = { latitude: -23.5505, longitude: -46.6333 } satisfies PlaceDetailsOutput;
	td.when(_service.getPlaceDetails(td.matchers.anything())).thenResolve(output);
	const response = await _app.fetch(
		_request({ path: "/places/details", body: { placeId: "place-1", sessionToken: "session-2" } }),
		_environment,
	);
	expect({
		status: response.status,
		output: await response.json(),
		serviceCalls: td.explain(_service.getPlaceDetails).calls.map((call) => call.args),
	}).toEqual({
		status: 200,
		output: {
			data: output,
			requestId: "request-1",
			timestamp: expect.any(String),
			endpoint: expect.stringMatching(/^\/places\/(search|details)$/),
		},
		serviceCalls: [
			[{ input: { placeId: "place-1", sessionToken: "session-2" }, rateLimitKey: "development:account-2" }],
		],
	});
});

it.each([
	{ name: "malformed JSON", path: "/places/search", body: "{", violationPaths: [["body"]] },
	{
		name: "invalid search",
		path: "/places/search",
		body: { query: 123, sessionToken: "" },
		violationPaths: [["query"], ["sessionToken"]],
	},
	{
		name: "invalid details",
		path: "/places/details",
		body: { placeId: "", sessionToken: "" },
		violationPaths: [["placeId"], ["sessionToken"]],
	},
])("rejects $name with field diagnostics before constructing a service", async ({ path, body, violationPaths }) => {
	td.when(_authService.getAuthenticatedAccountIdOrNull(td.matchers.anything())).thenResolve("account-1");
	const response = await _app.fetch(_request({ path: path, body: body, language: "pt-BR" }), _environment);
	expect({
		status: response.status,
		body: await response.json(),
		serviceCalls: td.explain(_service.searchPlaces).callCount + td.explain(_service.getPlaceDetails).callCount,
	}).toMatchObject({
		status: 400,
		body: {
			errorCode: MapsErrorCode.INVALID_REQUEST,
			violations: expect.arrayContaining(violationPaths.map((path) => ({ path: path, message: expect.any(String) }))),
		},
		serviceCalls: 0,
	});
});

it.each([undefined, "", "   ", ",pt-BR", "not a locale"])(
	"rejects the invalid search locale %s before constructing a service",
	async (language) => {
		td.when(_authService.getAuthenticatedAccountIdOrNull(td.matchers.anything())).thenResolve("account-1");
		const response = await _app.fetch(_request({ language: language }), _environment);
		expect({
			status: response.status,
			body: await response.json(),
			serviceCalls: td.explain(_service.searchPlaces).callCount + td.explain(_service.getPlaceDetails).callCount,
		}).toMatchObject({
			status: 400,
			body: { violations: [{ path: ["headers", "Accept-Language"], message: "Expected a valid language tag." }] },
			serviceCalls: 0,
		});
	},
);

it.each(["/places/search", "/places/details"])("requires QUERY at %s", async (path) => {
	td.when(_authService.getAuthenticatedAccountIdOrNull(td.matchers.anything())).thenResolve("account-1");
	const response = await _app.fetch(_request({ path: path, method: "POST" }), _environment);
	expect({
		status: response.status,
		allow: response.headers.get("Allow"),
		serviceCalls: td.explain(_service.searchPlaces).callCount + td.explain(_service.getPlaceDetails).callCount,
	}).toEqual({ status: 405, allow: "QUERY", serviceCalls: 0 });
});

it("authenticates unsupported methods before returning method diagnostics", async () => {
	td.when(_authService.getAuthenticatedAccountIdOrNull(td.matchers.anything())).thenResolve(null);
	const response = await _app.fetch(_request({ method: "POST" }), _environment);
	expect({ status: response.status, allow: response.headers.get("Allow"), body: await response.json() }).toMatchObject({
		status: 401,
		allow: null,
		body: { errorCode: MapsErrorCode.UNAUTHORIZED },
	});
});

it("keeps unknown place routes as not found", async () => {
	td.when(_authService.getAuthenticatedAccountIdOrNull(td.matchers.anything())).thenResolve("account-1");
	const response = await _app.fetch(_request({ path: "/places/unknown", method: "POST" }), _environment);
	expect({ status: response.status, allow: response.headers.get("Allow") }).toEqual({ status: 404, allow: null });
});

it.each([
	{
		failure: new PlaceSearchRateLimitedError(),
		status: 429,
		retryAfter: "60",
		publicCode: MapsErrorCode.RATE_LIMITED,
	},
	{
		failure: new PlaceDetailsRateLimitedError(),
		status: 429,
		retryAfter: "60",
		publicCode: MapsErrorCode.RATE_LIMITED,
	},
	{
		failure: new PlaceProviderUnavailableError(),
		status: 502,
		retryAfter: null,
		publicCode: MapsErrorCode.PROVIDER_UNAVAILABLE,
	},
	{
		failure: new PlaceProviderResponseInvalidError(),
		status: 502,
		retryAfter: null,
		publicCode: MapsErrorCode.PROVIDER_UNAVAILABLE,
	},
	{
		failure: new PlaceProviderTimeoutError(),
		status: 504,
		retryAfter: null,
		publicCode: MapsErrorCode.PROVIDER_UNAVAILABLE,
	},
])(
	"presents the owned $failure.name failure without provider details",
	async ({ failure, status, retryAfter, publicCode }) => {
		td.when(_authService.getAuthenticatedAccountIdOrNull(td.matchers.anything())).thenResolve("account-1");
		td.when(_service.searchPlaces(td.matchers.anything())).thenReject(failure);
		const response = await _app.fetch(_request({ language: "pt-BR" }), _environment);
		expect({
			status: response.status,
			retryAfter: response.headers.get("Retry-After"),
			body: await response.json(),
		}).toMatchObject({
			status: status,
			retryAfter: retryAfter,
			body: { errorCode: publicCode },
		});
	},
);
