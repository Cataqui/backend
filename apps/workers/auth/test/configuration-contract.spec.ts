import { resolve } from "node:path";
import { loadAndParseConfig, loadAndParseConfigSettings } from "@cloudflare/config";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllEnvs());

describe("Auth runtime configuration", () => {
	it("enables incoming cancellation signals for NOTP long polling", async () => {
		const { result } = await loadAndParseConfig(resolve("cloudflare.config.ts"), { mode: undefined, isPreview: false });
		expect(result.success).toBe(true);
		if (!result.success) throw result.error;
		expect(result.data.worker?.compatibilityFlags).toEqual(
			expect.arrayContaining(["nodejs_compat", "enable_request_signal"]),
		);
	});

	it("keeps account inspection independent of deployment IDs", async () => {
		vi.stubEnv("HYPERDRIVE_ID", undefined);
		const { result } = await loadAndParseConfigSettings(resolve("cloudflare.config.ts"), {
			mode: "production",
			isPreview: false,
		});
		expect(result).toMatchObject({ success: true, data: { accountId: "1fca946385505503c59dd6a2a4eeb442" } });
	});

	it("keeps local development independent of deployment IDs", async () => {
		vi.stubEnv("HYPERDRIVE_ID", undefined);
		const { result } = await loadAndParseConfig(resolve("cloudflare.config.ts"), { mode: undefined, isPreview: false });
		expect(result).toMatchObject({
			success: true,
			data: {
				worker: {
					name: "cataqui-auth-development",
					workersDev: true,
					domains: [],
					env: { DB: { type: "hyperdrive", id: "local" } },
				},
			},
		});
	});

	it.each(["staging", "production"])("reads a fresh Hyperdrive ID for %s", async (environment) => {
		vi.stubEnv("HYPERDRIVE_ID", "a".repeat(32));
		const first = await loadAndParseConfig(resolve("cloudflare.config.ts"), { mode: environment, isPreview: false });
		vi.stubEnv("HYPERDRIVE_ID", "b".repeat(32));
		const second = await loadAndParseConfig(resolve("cloudflare.config.ts"), { mode: environment, isPreview: false });
		expect(first.result).toMatchObject({ success: true, data: { worker: { env: { DB: { id: "a".repeat(32) } } } } });
		expect(second.result).toMatchObject({ success: true, data: { worker: { env: { DB: { id: "b".repeat(32) } } } } });
	});

	it.each([undefined, ""])("rejects a missing deployment ID: %s", async (id) => {
		vi.stubEnv("HYPERDRIVE_ID", id);
		await expect(
			loadAndParseConfig(resolve("cloudflare.config.ts"), { mode: "staging", isPreview: false }),
		).rejects.toThrow("HYPERDRIVE_ID is required for Auth deployment.");
	});

	it("rejects unsupported environments", async () => {
		await expect(
			loadAndParseConfig(resolve("cloudflare.config.ts"), { mode: "preview", isPreview: false }),
		).rejects.toThrow();
	});

	it("declares runtime secrets without embedding their values", async () => {
		vi.stubEnv("META_APP_SECRET", "not-a-build-artifact-secret");
		const { result } = await loadAndParseConfig(resolve("cloudflare.config.ts"), { mode: undefined, isPreview: false });
		expect(result).toMatchObject({ success: true, data: { worker: { env: { META_APP_SECRET: { type: "secret" } } } } });
		expect(JSON.stringify(result)).not.toContain("not-a-build-artifact-secret");
	});

	it.each(["staging", "production"])("preserves hosted settings for %s", async (environment) => {
		vi.stubEnv("HYPERDRIVE_ID", "a".repeat(32));
		const { result } = await loadAndParseConfig(resolve("cloudflare.config.ts"), {
			mode: environment,
			isPreview: false,
		});
		const isProduction = environment === "production";
		expect(result).toMatchObject({
			success: true,
			data: {
				worker: {
					name: `cataqui-auth-${environment}`,
					workersDev: false,
					domains: [isProduction ? "auth.cataqui.com" : "staging.auth.cataqui.com"],
					triggers: [{ type: "scheduled", schedule: "17 3 * * *" }],
					env: {
						WHATSAPP_NOTP_PHONE_NUMBER_ID: {
							type: "text",
							value: isProduction ? "1203689159488121" : "1211194405413752",
						},
						WHATSAPP_NOTP_RECEIVER: { type: "text", value: isProduction ? "+5511963270517" : "+15556625497" },
					},
				},
			},
		});
	});
});
