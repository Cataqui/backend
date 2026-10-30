import type { Handler } from "hono";
import { HTTPException } from "hono/http-exception";
import * as td from "testdouble";
import worker from "./app";
import { AiErrorCode } from "./errors/ai-error-code.enum";
import type { AiContext } from "./http/context";

const _failingHandler = td.func<Handler<AiContext>>();
worker.get("/__test/failure", _failingHandler);

afterEach(() => td.reset());
afterEach(() => vi.useRealTimers());

it("serves health without authentication, AI bindings, caching, or a response body", async () => {
	const response = await worker.request("/v1/health");
	expect({
		status: response.status,
		cacheControl: response.headers.get("Cache-Control"),
		requestId: response.headers.get("x-request-id"),
		body: await response.text(),
	}).toEqual({
		status: 204,
		cacheControl: "no-store",
		requestId: expect.any(String),
		body: "",
	});
});

it("preserves request correlation on health responses", async () => {
	const response = await worker.request("/v1/health", { headers: { "x-request-id": "health-request" } });
	expect(response.headers.get("x-request-id")).toBe("health-request");
});

it.each(["/unknown", "/v1/inference/name-meaning"])("returns the owned error envelope for %s", async (path) => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-10-24T12:00:00.000Z"));
	const response = await worker.request(path, { headers: { "x-request-id": "missing-route" } });
	expect({
		status: response.status,
		cacheControl: response.headers.get("Cache-Control"),
		requestId: response.headers.get("x-request-id"),
		body: await response.json(),
	}).toEqual({
		status: 404,
		cacheControl: "no-store",
		requestId: "missing-route",
		body: {
			errorCode: AiErrorCode.ROUTE_NOT_FOUND,
			message: "The requested route was not found.",
			status: 404,
			requestId: "missing-route",
			timestamp: "2026-10-24T12:00:00.000Z",
			endpoint: path,
		},
	});
});

it.each([new Error("secret provider diagnostic"), new HTTPException(401, { message: "secret provider diagnostic" })])(
	"sanitizes unexpected failures in responses and logs: %s",
	async (failure) => {
		td.replace(console, "error");
		td.when(_failingHandler(td.matchers.anything(), td.matchers.anything())).thenThrow(failure);
		const response = await worker.request("/__test/failure?private=secret", {
			headers: { "x-request-id": "failed-request" },
		});
		expect({
			status: response.status,
			cacheControl: response.headers.get("Cache-Control"),
			requestId: response.headers.get("x-request-id"),
			body: await response.json(),
		}).toEqual({
			status: 500,
			cacheControl: "no-store",
			requestId: "failed-request",
			body: {
				errorCode: AiErrorCode.INTERNAL_ERROR,
				message: "An unexpected error occurred.",
				status: 500,
				requestId: "failed-request",
				timestamp: expect.any(String),
				endpoint: "/__test/failure",
			},
		});
		td.verify(
			console.error({
				event: "ai.request.failed",
				method: "GET",
				requestId: "failed-request",
				responseStatus: 500,
				errorCode: AiErrorCode.INTERNAL_ERROR,
			}),
			{ times: 1 },
		);
	},
);
