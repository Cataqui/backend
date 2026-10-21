import { type InferEnv, bindings, defineConfig, defineWorker } from "cf/config";
import { worker as mapshotWorker } from "../../mapshot/worker/cloudflare.config.ts";
import { worker as authWorker } from "../auth/cloudflare.config.ts";
import { z } from "zod";
import * as entrypoint from "./src/app.ts" with { type: "cf-worker" };

const _modeSchema = z.enum(["development", "staging", "production"]);

export const worker = defineWorker(({ mode }) => ({
	name: `cataqui-maps-${_modeSchema.parse(mode ?? "development")}`,
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
				staging: ["staging.maps.cataqui.com"],
				production: ["maps.cataqui.com"],
			}[environment],
			cache: { enabled: true, crossVersionCache: true },
			limits: { subrequests: 100000 },
			observability: {
				enabled: true,
				logs: { enabled: true, headSamplingRate: 1, invocationLogs: false },
			},
			env: {
				ENVIRONMENT: bindings.text(environment),
				STATIC_BASE_URL: bindings.text(
					{
						development: "http://localhost:8787",
						staging: "https://staging.maps.cataqui.com",
						production: "https://maps.cataqui.com",
					}[environment],
				),
				GOOGLE_PLACES_API_KEY: bindings.secret(),
				STATIC_MAP_LOCATION_SIGNING_KEY_BASE64URL: bindings.secret(),
				PLACE_SEARCH_RATE_LIMITER: bindings.rateLimit({ namespace: "20001", simple: { limit: 30, period: 60 } }),
				PLACE_DETAILS_RATE_LIMITER: bindings.rateLimit({ namespace: "20002", simple: { limit: 10, period: 60 } }),
				MAPSHOT: bindings.worker({ worker: mapshotWorker }),
				AUTH: bindings.worker({ worker: authWorker, exportName: "AuthEntrypoint" }),
			},
		};
	},
});

export type MapsWorkerEnv = InferEnv<ReturnType<typeof _config.worker>>;

export default _config;
