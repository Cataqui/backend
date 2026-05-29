import type { FastifyRequest } from "fastify";
import { RequestUtils } from "./request.utils";

function createMockRequest(headers: Record<string, string | undefined>, url = "/api/v1/test"): FastifyRequest {
	return { headers, url } as FastifyRequest;
}

describe("RequestUtils", () => {
	describe("resolveRequestId", () => {
		it("should return X-Request-ID header value when present", () => {
			const request = createMockRequest({ "x-request-id": "custom-request-id" });
			const result = RequestUtils.resolveRequestId(request);
			expect(result).toBe("custom-request-id");
		});

		it("should generate a UUID when no X-Request-ID header is present", () => {
			const request = createMockRequest({});
			const result = RequestUtils.resolveRequestId(request);
			expect(result).toMatch(/^[0-9a-f-]{36}$/);
		});

		it("should generate a UUID when X-Request-ID is an empty string", () => {
			const request = createMockRequest({ "x-request-id": "" });
			const result = RequestUtils.resolveRequestId(request);
			expect(result).toMatch(/^[0-9a-f-]{36}$/);
		});
	});

	describe("resolveEndpoint", () => {
		it("should return request.url", () => {
			const request = createMockRequest({}, "/api/v1/posts/abc123");
			const result = RequestUtils.resolveEndpoint(request);
			expect(result).toBe("/api/v1/posts/abc123");
		});

		it("should return request.url with query string", () => {
			const request = createMockRequest({}, "/api/v1/feed?cursor=abc&limit=20");
			const result = RequestUtils.resolveEndpoint(request);
			expect(result).toBe("/api/v1/feed?cursor=abc&limit=20");
		});
	});
});
