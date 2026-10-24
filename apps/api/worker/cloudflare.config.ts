import {
	type InferEnv,
	bindings,
	defineConfig,
	defineContainer,
	defineWorker,
	exports as workerExports,
} from "cf/config";
import { worker as authWorker } from "../../workers/auth/cloudflare.config.ts";
import { worker as mapsWorker } from "../../workers/maps/cloudflare.config.ts";
import { z } from "zod";
import * as entrypoint from "./src/worker.ts" with { type: "cf-worker" };

const _modeSchema = z.enum(["development", "staging", "production"]).default("development");

const _accountId = "1fca946385505503c59dd6a2a4eeb442";

export const worker = defineWorker(({ mode }) => ({
	name: `cataqui-api-${_modeSchema.parse(mode)}`,
	entrypoint: entrypoint,
	compatibilityDate: "2026-10-15",
	compatibilityFlags: ["nodejs_compat"],
	exports: {
		ApiContainer: workerExports.durableObject({ storage: "sqlite" }),
		ApiWorkerPortal: workerExports.worker({ cache: { enabled: false } }),
	},
}));

const _container = defineContainer(({ mode }) => {
	const environment = _modeSchema.parse(mode);
	return {
		name: {
			development: "cataqui-api-development-apicontainer",
			staging: "cataqui-api-staging-apicontainer-staging",
			production: "cataqui-api-production-apicontainer-production",
		}[environment],
		image: { dockerfile: "../Dockerfile", buildContext: "../../.." },
		maxInstances: 1,
		instanceType: ({ development: "basic", staging: "basic", production: "standard-1" } as const)[environment],
		constraints: { regions: ["SAM"] },
		...{
			development: {},
			staging: { rollout: { activeGracePeriod: 60, stepPercentage: 100 } },
			production: { rollout: { activeGracePeriod: 300, stepPercentage: 100 } },
		}[environment],
	};
});

const _config = defineConfig({
	accountId: _accountId,
	containers: [_container],
	worker: (context) => {
		const environment = _modeSchema.parse(context.mode);
		const definition = worker(context);
		return {
			...definition,
			workersDev: { development: true, staging: false, production: false }[environment],
			domains: {
				development: [],
				staging: ["staging.api.cataqui.com"],
				production: ["api.cataqui.com"],
			}[environment],
			cache: { enabled: false, crossVersionCache: false },
			exports: {
				...definition.exports,
				ApiContainer: workerExports.durableObject({ storage: "sqlite", container: _container }),
			},
			env: {
				MAPS: bindings.worker({ worker: mapsWorker, exportName: "WorkerEntrypoint" }),
				AUTH: bindings.worker({ worker: authWorker, exportName: "AuthEntrypoint" }),
				ENVIRONMENT: bindings.text(environment),
				SLEEP_AFTER_MS: bindings.json({ development: 300000, staging: 300000, production: 3600000 }[environment]),
				CORS_ORIGINS: bindings.text(
					{
						development: "http://localhost:3000",
						staging: "https://staging.cataqui.com",
						production: "https://cataqui.com",
					}[environment],
				),
				AI_GATEWAY_ID: bindings.text(`cataqui-api-${environment}`),
				CLOUDFLARE_ACCOUNT_ID: bindings.text(_accountId),
				DATABASE_APP_POOLER_URL: bindings.secret(),
				AI_GATEWAY_API_TOKEN: bindings.secret(),
				UPSTASH_REDIS_REST_URL: bindings.secret(),
				UPSTASH_REDIS_REST_TOKEN: bindings.secret(),
			},
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

export type ApiWorkerEnv = InferEnv<ReturnType<typeof _config.worker>>;

export default _config;
