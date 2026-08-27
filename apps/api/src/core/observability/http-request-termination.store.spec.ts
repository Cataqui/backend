import type { FastifyRequest } from "fastify";
import { HttpRequestTerminationReason } from "./http-request-termination-reason.enum";
import { findHttpRequestTerminationReason, rememberHttpRequestTermination } from "./http-request-termination.store";

describe("HTTP request termination store", () => {
	it("should return the bounded termination reason remembered for the same request", () => {
		const request = {} as FastifyRequest;

		rememberHttpRequestTermination({
			request: request,
			terminationReason: HttpRequestTerminationReason.ABORTED,
		});

		expect(findHttpRequestTerminationReason({ request: request })).toBe(HttpRequestTerminationReason.ABORTED);
	});

	it("should not report a termination reason for a request that completed normally", () => {
		const request = {} as FastifyRequest;

		expect(findHttpRequestTerminationReason({ request: request })).toBeUndefined();
	});

	it("should preserve the first terminal outcome when later socket events fire", () => {
		const request = {} as FastifyRequest;
		rememberHttpRequestTermination({
			request: request,
			terminationReason: HttpRequestTerminationReason.TIMEOUT,
		});

		rememberHttpRequestTermination({
			request: request,
			terminationReason: HttpRequestTerminationReason.ABORTED,
		});

		expect(findHttpRequestTerminationReason({ request: request })).toBe(HttpRequestTerminationReason.TIMEOUT);
	});
});
