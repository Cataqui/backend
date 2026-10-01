import { type Span, SpanStatusCode } from "@opentelemetry/api";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { recordRequestException, registerHttpTelemetryHooks } from "./http-telemetry.hook";

const getActiveSpan = vi.hoisted(() => vi.fn<() => Span | undefined>());

vi.mock("@opentelemetry/api", async (importOriginal) => {
	const original = await importOriginal<typeof import("@opentelemetry/api")>();
	return { ...original, trace: { ...original.trace, getActiveSpan: getActiveSpan } };
});

function _createSpan(): Span {
	return {
		setAttribute: vi.fn(),
		updateName: vi.fn(),
		recordException: vi.fn(),
		setStatus: vi.fn(),
	} as unknown as Span;
}

async function _createServer(): Promise<{ fastify: FastifyInstance; requests: FastifyRequest[] }> {
	const fastify = Fastify();
	const requests: FastifyRequest[] = [];
	registerHttpTelemetryHooks(fastify);
	fastify.get("/v1/jobs/:jobId", async (request) => {
		requests.push(request);
		return {};
	});
	await fastify.ready();
	return { fastify: fastify, requests: requests };
}

describe("registerHttpTelemetryHooks", () => {
	beforeEach(() => {
		getActiveSpan.mockReset();
	});

	it("should tag the request trace with the route template instead of the concrete URL", async () => {
		const span = _createSpan();
		getActiveSpan.mockReturnValue(span);
		const { fastify } = await _createServer();

		await fastify.inject({ method: "GET", url: "/v1/jobs/7f3c" });

		expect(span.setAttribute).toHaveBeenCalledWith("http.route", "/v1/jobs/:jobId");
	});

	it("should name the request trace after the method and route so Datadog groups it per endpoint", async () => {
		const span = _createSpan();
		getActiveSpan.mockReturnValue(span);
		const { fastify } = await _createServer();

		await fastify.inject({ method: "GET", url: "/v1/jobs/7f3c" });

		expect(span.updateName).toHaveBeenCalledWith("GET /v1/jobs/:jobId");
	});

	it("should keep the default span name for unknown routes so random URLs do not create new Datadog resources", async () => {
		const span = _createSpan();
		getActiveSpan.mockReturnValue(span);
		const { fastify } = await _createServer();

		await fastify.inject({ method: "GET", url: "/v1/does-not-exist" });

		expect(span.updateName).not.toHaveBeenCalled();
	});

	it("should serve requests normally when telemetry is disabled", async () => {
		getActiveSpan.mockReturnValue(undefined);
		const { fastify } = await _createServer();

		const response = await fastify.inject({ method: "GET", url: "/v1/jobs/7f3c" });

		expect(response.statusCode).toBe(200);
	});
});

describe("recordRequestException", () => {
	beforeEach(() => {
		getActiveSpan.mockReset();
	});

	it("should attach the error to the request trace", async () => {
		const span = _createSpan();
		getActiveSpan.mockReturnValue(span);
		const { fastify, requests } = await _createServer();
		await fastify.inject({ method: "GET", url: "/v1/jobs/7f3c" });
		const error = new Error("Database unavailable");

		recordRequestException(requests[0] as FastifyRequest, error);

		expect(span.recordException).toHaveBeenCalledWith(error);
	});

	it("should mark the request trace as an error", async () => {
		const span = _createSpan();
		getActiveSpan.mockReturnValue(span);
		const { fastify, requests } = await _createServer();
		await fastify.inject({ method: "GET", url: "/v1/jobs/7f3c" });

		recordRequestException(requests[0] as FastifyRequest, new Error("Database unavailable"));

		expect(span.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.ERROR });
	});

	it("should ignore requests that have no trace", async () => {
		getActiveSpan.mockReturnValue(undefined);
		const { fastify, requests } = await _createServer();
		await fastify.inject({ method: "GET", url: "/v1/jobs/7f3c" });

		const record = () => recordRequestException(requests[0] as FastifyRequest, new Error("Database unavailable"));

		expect(record).not.toThrow();
	});
});
