import { resolve } from "node:path";
import { loadAndParseConfig, type ParsedInputWorkerConfig } from "@cloudflare/config";
import type { AiWorkerEnv } from "../cloudflare.config.ts";

async function _loadWorker(mode: string | undefined): Promise<ParsedInputWorkerConfig> {
	const { result } = await loadAndParseConfig(resolve("cloudflare.config.ts"), { mode: mode, isPreview: false });
	if (!result.success) throw result.error;
	if (!result.data.worker) throw new TypeError("AI configuration requires a Worker.");
	return result.data.worker;
}

describe("AI runtime configuration", () => {
	it.each(["development", "staging", "production"])("isolates the scaffold in %s", async (environment) => {
		const worker = await _loadWorker(environment);
		expect(worker).toMatchObject({
			name: `cataqui-ai-${environment}`,
			entrypoint: resolve("src/app.ts"),
			compatibilityDate: "2026-10-02",
			compatibilityFlags: ["nodejs_compat", "enable_request_signal"],
			workersDev: false,
			previewUrls: false,
			observability: {
				enabled: true,
				logs: { enabled: true, headSamplingRate: 1, invocationLogs: false },
			},
		});
		expect(worker.env).toEqual({
			ENVIRONMENT: { type: "text", value: environment },
			AI: { type: "ai" },
			AI_GATEWAY_ID: { type: "text", value: `cataqui-ai-worker-${environment}` },
			AUTH: { type: "worker", worker: `cataqui-auth-${environment}`, exportName: "AuthEntrypoint" },
			NAME_MEANING_RATE_LIMITER: { type: "rate-limit", namespace: "30001", simple: { limit: 10, period: 60 } },
		});
		expect(worker.exports ?? {}).toEqual({});
		expect(worker.triggers ?? []).toEqual([]);
	});

	it("defaults to the development identity", async () => {
		const worker = await _loadWorker(undefined);
		expect(worker.name).toBe("cataqui-ai-development");
		expect(worker.domains).toEqual([]);
		expect(worker.env).toEqual({
			ENVIRONMENT: { type: "text", value: "development" },
			AI: { type: "ai" },
			AI_GATEWAY_ID: { type: "text", value: "cataqui-ai-worker-development" },
			AUTH: { type: "worker", worker: "cataqui-auth-development", exportName: "AuthEntrypoint" },
			NAME_MEANING_RATE_LIMITER: { type: "rate-limit", namespace: "30001", simple: { limit: 10, period: 60 } },
		});
	});

	it("exposes native AI methods through the owning generated environment", () => {
		expectTypeOf<Cloudflare.Env["AI"]>().toEqualTypeOf<AiWorkerEnv["AI"]>();
		expectTypeOf<AiWorkerEnv["AI"]>().toEqualTypeOf<Ai>();
		expectTypeOf<AiWorkerEnv["AI"]["gateway"]>().returns.toEqualTypeOf<AiGateway>();
		expectTypeOf<AiWorkerEnv["AI"]["run"]>().toBeFunction();
	});

	it.each([
		["development", []],
		["staging", ["staging.ai.cataqui.com"]],
		["production", ["ai.cataqui.com"]],
	] as const)("uses only the owning domains in %s", async (environment, domains) => {
		const worker = await _loadWorker(environment);
		expect(worker.domains).toEqual(domains);
	});

	it("rejects unsupported modes", async () => {
		await expect(_loadWorker("preview")).rejects.toThrow();
	});
});
