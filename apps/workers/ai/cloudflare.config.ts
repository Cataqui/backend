import { type InferEnv, bindings, defineConfig, defineWorker } from "cf/config";
import { z } from "zod";
import { worker as authWorker } from "../auth/cloudflare.config.ts";
import { RateLimitConfig } from "./src/inference/rate-limit.config.ts";
import * as entrypoint from "./src/app.ts" with { type: "cf-worker" };

const _modeSchema = z.enum(["development", "staging", "production"]);

export const worker = defineWorker(({ mode }) => ({
	name: `cataqui-ai-${_modeSchema.parse(mode ?? "development")}`,
	entrypoint: entrypoint,
	compatibilityDate: "2026-10-02",
}));

const _config = defineConfig({
	accountId: "1fca946385505503c59dd6a2a4eeb442",
	worker: (context) => {
		const environment = _modeSchema.parse(context.mode ?? "development");

		return {
			...worker(context),
			compatibilityFlags: ["nodejs_compat", "enable_request_signal"],
			workersDev: false,
			previewUrls: false,
			domains: {
				development: [],
				staging: ["staging.ai.cataqui.com"],
				production: ["ai.cataqui.com"],
			}[environment],
			observability: {
				enabled: true,
				logs: { enabled: true, headSamplingRate: 1, invocationLogs: false },
			},
			env: {
				ENVIRONMENT: bindings.text(environment),
				AI: bindings.ai(),
				AI_GATEWAY_ID: bindings.text(`cataqui-ai-worker-${environment}`),
				AUTH: bindings.worker({ worker: authWorker, exportName: "AuthEntrypoint" }),
				NAME_ANALYSIS_RATE_LIMITER: bindings.rateLimit({ namespace: "30001", simple: RateLimitConfig.nameAnalysis }),
			},
		};
	},
});

export type AiWorkerEnv = InferEnv<ReturnType<typeof _config.worker>>;

export default _config;
