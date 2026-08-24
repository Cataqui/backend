vi.mock("@cloudflare/containers", () => ({ Container: class {}, ContainerProxy: class {} }));

import { ApiContainer } from "./api-container";

describe("ApiContainer request boundary", () => {
	it("should forward only the explicitly allowed API process environment values", () => {
		const container = new ApiContainer(
			{} as never,
			{
				NODE_ENV: "development",
				DATABASE_APP_POOLER_URL: "postgresql://pooler",
				CORS_ORIGINS: "https://cataqui.com",
				CLOUDFLARE_ACCOUNT_ID: "account-id",
				DERIVE_JOB_DATA_AI_GATEWAY_API_TOKEN: "gateway-token",
				DERIVE_JOB_DATA_AI_GATEWAY_ID: "gateway-id",
				UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
				UPSTASH_REDIS_REST_TOKEN: "redis-token",
				AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL: "auth-refresh-token-hmac-key-v1-base64url",
				MICROSERVICES_AUTH_JWT_PRIVATE_KEY_V1_PKCS8_BASE64: "microservices-auth-private-key",
				WHATSAPP_AUTH_RECEIVER: "+5511963270517",
				SLEEP_AFTER: "5m",
				API_CONTAINER_POOL_SIZE: "10",
				API_CONTAINER: {},
				DERIVE_JOB_DATA_QUEUE: {},
			} as never,
		);

		expect(container.envVars).toEqual({
			NODE_ENV: "development",
			DATABASE_APP_POOLER_URL: "postgresql://pooler",
			CORS_ORIGINS: "https://cataqui.com",
			CLOUDFLARE_ACCOUNT_ID: "account-id",
			DERIVE_JOB_DATA_AI_GATEWAY_API_TOKEN: "gateway-token",
			DERIVE_JOB_DATA_AI_GATEWAY_ID: "gateway-id",
			UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
			UPSTASH_REDIS_REST_TOKEN: "redis-token",
			AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL: "auth-refresh-token-hmac-key-v1-base64url",
			MICROSERVICES_AUTH_JWT_PRIVATE_KEY_V1_PKCS8_BASE64: "microservices-auth-private-key",
			WHATSAPP_AUTH_RECEIVER: "+5511963270517",
		});
	});

	it("should use process liveness for container startup checks", () => {
		const container = new ApiContainer(
			{} as never,
			{
				SLEEP_AFTER: "5m",
			} as ApiWorkerEnv,
		);

		expect(container.pingEndpoint).toBe("localhost/v1/health/live");
	});

	it("should hide internal paths from externally forwarded requests", async () => {
		const containerFetch = vi.fn();
		const container = { containerFetch: containerFetch } as unknown as ApiContainer;

		const response = await ApiContainer.prototype.fetch.call(
			container,
			new Request("https://api.cataqui.com/internal/inbound/derive-job-data", {
				method: "POST",
			}),
		);

		expect(response.status).toBe(404);
	});

	it("should not forward hidden internal paths to Nest", async () => {
		const containerFetch = vi.fn();
		const container = { containerFetch: containerFetch } as unknown as ApiContainer;

		await ApiContainer.prototype.fetch.call(
			container,
			new Request("https://api.cataqui.com/internal/inbound/derive-job-data", {
				method: "POST",
			}),
		);

		expect(containerFetch).not.toHaveBeenCalled();
	});

	it("should hide percent-encoded internal paths from externally forwarded requests", async () => {
		const container = { containerFetch: vi.fn() } as unknown as ApiContainer;

		const response = await ApiContainer.prototype.fetch.call(
			container,
			new Request("https://api.cataqui.com/%69nternal/inbound/verify-whatsapp-auth-message", {
				method: "POST",
			}),
		);

		expect(response.status).toBe(404);
	});

	it("should reject malformed URL encoding before forwarding to Nest", async () => {
		const container = { containerFetch: vi.fn() } as unknown as ApiContainer;

		const response = await ApiContainer.prototype.fetch.call(
			container,
			new Request("https://api.cataqui.com/%E0%A4%A", { method: "POST" }),
		);

		expect(response.status).toBe(400);
	});

	it("should continue forwarding public requests to Nest", async () => {
		const expectedResponse = new Response("ok");
		const containerFetch = vi.fn().mockResolvedValue(expectedResponse);
		const container = { containerFetch: containerFetch } as unknown as ApiContainer;
		const request = new Request("https://api.cataqui.com/v1/jobs/drafts", { method: "POST" });

		const response = await ApiContainer.prototype.fetch.call(container, request);

		expect(response).toBe(expectedResponse);
	});

	it("should emit searchable metadata when the API process fails to start", () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const error = Object.assign(new Error("Application process exited"), { exitCode: 1 });

		ApiContainer.prototype.onError.call({} as ApiContainer, error);

		expect(consoleError).toHaveBeenCalledWith({
			event: "api.container.start.failed",
			errorName: "Error",
			errorMessage: "Application process exited",
			exitCode: 1,
			diagnosticEvent: "api.application.start.failed",
		});
	});

	it("should emit the nonzero exit code when the API process stops unexpectedly", () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

		ApiContainer.prototype.onStop.call({} as ApiContainer, { exitCode: 1, reason: "exit" });

		expect(consoleError).toHaveBeenCalledWith({
			event: "api.container.stopped",
			exitCode: 1,
			reason: "exit",
		});
	});
});
