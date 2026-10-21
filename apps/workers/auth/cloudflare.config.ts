import { type InferEnv, bindings, defineConfig, defineWorker, triggers } from "cf/config";
import { z } from "zod";
import * as entrypoint from "./src/app.ts" with { type: "cf-worker" };
import { AuthSchedules } from "./src/schedules.ts";

const _modeSchema = z.enum(["development", "staging", "production"]);

export const worker = defineWorker(({ mode }) => ({
	name: `cataqui-auth-${_modeSchema.parse(mode ?? "development")}`,
	entrypoint: entrypoint,
	compatibilityDate: "2026-10-07",
}));

const _config = defineConfig({
	accountId: "1fca946385505503c59dd6a2a4eeb442",
	worker: (context) => {
		const environment = _modeSchema.parse(context.mode ?? "development");
		const hyperdriveId = environment === "development" ? "local" : process.env["HYPERDRIVE_ID"];
		if (!hyperdriveId) {
			throw new Error("HYPERDRIVE_ID is required for Auth deployment.");
		}

		return {
			...worker(context),
			compatibilityFlags: ["nodejs_compat", "enable_request_signal"],
			workersDev: { development: true, staging: false, production: false }[environment],
			domains: {
				development: [],
				staging: ["staging.auth.cataqui.com"],
				production: ["auth.cataqui.com"],
			}[environment],
			env: {
				DB: bindings.hyperdrive({ id: hyperdriveId }),
				WHATSAPP_NOTP_PHONE_NUMBER_ID: bindings.text(
					{
						development: "1211194405413752",
						staging: "1211194405413752",
						production: "1203689159488121",
					}[environment],
				),
				WHATSAPP_NOTP_RECEIVER: bindings.text(
					{ development: "+15556625497", staging: "+15556625497", production: "+5511963270517" }[environment],
				),
				META_APP_SECRET: bindings.secret(),
				WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN: bindings.secret(),
				AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL: bindings.secret(),
				UPSTASH_REDIS_REST_URL: bindings.secret(),
				UPSTASH_REDIS_REST_TOKEN: bindings.secret(),
			},
			triggers: [triggers.scheduled({ schedule: AuthSchedules.DELETE_EXPIRED_SESSIONS })],
			observability: {
				enabled: true,
				logs: {
					enabled: true,
					headSamplingRate: 1,
					...{ development: {}, staging: {}, production: { invocationLogs: false } }[environment],
				},
			},
		};
	},
});

export type AuthWorkerEnv = InferEnv<ReturnType<typeof _config.worker>>;

export default _config;
