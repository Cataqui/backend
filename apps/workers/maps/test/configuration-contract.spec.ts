import { resolve } from "node:path";
import { loadAndParseConfig, type ParsedInputWorkerConfig } from "@cloudflare/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import tooling from "../wrangler.config.ts";

afterEach(() => vi.unstubAllEnvs());

async function _loadWorker(mode: string | undefined): Promise<ParsedInputWorkerConfig> {
	const { result } = await loadAndParseConfig(resolve("cloudflare.config.ts"), { mode: mode, isPreview: false });
	if (!result.success) throw result.error;
	if (!result.data.worker) throw new TypeError("Maps configuration requires a Worker.");
	return result.data.worker;
}

describe("Maps runtime configuration", () => {
	it("compiles decorator metadata before bundling Maps sources", () => {
		expect(tooling).toMatchObject({
			build: {
				command: "pnpm --filter @cataqui/maps-worker compile",
				watchDir: "src",
			},
		});
	});

	it.each(["development", "staging", "production"])(
		"preserves delivery and provider policy in %s",
		async (environment) => {
			vi.stubEnv("HYPERDRIVE_ID", undefined);
			const worker = await _loadWorker(environment);
			expect(worker).toMatchObject({
				name: `cataqui-maps-${environment}`,
				compatibilityDate: "2026-10-02",
				compatibilityFlags: ["nodejs_compat", "enable_request_signal"],
				workersDev: false,
				previewUrls: false,
				cache: { enabled: true, crossVersionCache: true },
				limits: { subrequests: 100000 },
				observability: {
					enabled: true,
					logs: { enabled: true, headSamplingRate: 1, invocationLogs: false },
				},
				env: {
					ENVIRONMENT: { type: "text", value: environment },
					GOOGLE_PLACES_API_KEY: { type: "secret" },
					STATIC_MAP_LOCATION_SIGNING_KEY_BASE64URL: { type: "secret" },
					PLACE_SEARCH_RATE_LIMITER: { type: "rate-limit", namespace: "20001", simple: { limit: 30, period: 60 } },
					PLACE_DETAILS_RATE_LIMITER: { type: "rate-limit", namespace: "20002", simple: { limit: 10, period: 60 } },
					MAPSHOT: { type: "worker", worker: `cataqui-mapshot-${environment}` },
					AUTH: { type: "worker", worker: `cataqui-auth-${environment}`, exportName: "AuthEntrypoint" },
				},
			});
			expect(Object.keys(worker.env ?? {})).toEqual([
				"ENVIRONMENT",
				"STATIC_BASE_URL",
				"GOOGLE_PLACES_API_KEY",
				"STATIC_MAP_LOCATION_SIGNING_KEY_BASE64URL",
				"PLACE_SEARCH_RATE_LIMITER",
				"PLACE_DETAILS_RATE_LIMITER",
				"MAPSHOT",
				"AUTH",
			]);
			expect(worker.exports ?? {}).toEqual({});
			expect(worker.triggers ?? []).toEqual([]);
		},
	);

	it("defaults to local public image URLs without hosted domains", async () => {
		const worker = await _loadWorker(undefined);
		expect(worker.domains).toEqual([]);
		expect(worker.env?.["STATIC_BASE_URL"]).toEqual({ type: "text", value: "http://localhost:8787" });
	});

	it.each([
		["staging", "staging.maps.cataqui.com"],
		["production", "maps.cataqui.com"],
	])("uses its public image domain in %s", async (environment, domain) => {
		const worker = await _loadWorker(environment);
		expect(worker.domains).toEqual([domain]);
		expect(worker.env?.["STATIC_BASE_URL"]).toEqual({ type: "text", value: `https://${domain}` });
	});

	it("rejects unsupported environments", async () => {
		await expect(_loadWorker("preview")).rejects.toThrow();
	});
});
