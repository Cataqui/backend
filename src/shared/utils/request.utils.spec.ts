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

	describe("resolveRequestLocale", () => {
		it("should return the first locale from Accept-Language", () => {
			const result = RequestUtils.resolveRequestLocale("es-MX,es;q=0.9,en;q=0.8");
			expect(result).toBe("es-MX");
		});

		it("should return the single locale when no quality values", () => {
			const result = RequestUtils.resolveRequestLocale("pt-BR");
			expect(result).toBe("pt-BR");
		});

		it("should return default locale when header is undefined", () => {
			const result = RequestUtils.resolveRequestLocale(undefined);
			expect(result).toBe("en-US");
		});

		it("should return default locale when header is empty string", () => {
			const result = RequestUtils.resolveRequestLocale("");
			expect(result).toBe("en-US");
		});

		it("should handle multiple locales with spaces", () => {
			const result = RequestUtils.resolveRequestLocale("fr-CA, fr;q=0.9");
			expect(result).toBe("fr-CA");
		});

		it("should trim whitespace from locale tags", () => {
			const result = RequestUtils.resolveRequestLocale("  de-DE  , en;q=0.9");
			expect(result).toBe("de-DE");
		});
	});
});
