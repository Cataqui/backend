import {
	type InferEnv,
	bindings,
	defineConfig,
	defineContainer,
	defineWorker,
	exports as workerExports,
} from "cf/config";
import { z } from "zod";
import * as entrypoint from "./src/worker.ts" with { type: "cf-worker" };

const _modeSchema = z.enum(["development", "staging", "production"]).default("development");

export const worker = defineWorker(({ mode }) => ({
	name: `cataqui-mapshot-${_modeSchema.parse(mode)}`,
	entrypoint: entrypoint,
	compatibilityDate: "2026-10-02",
	compatibilityFlags: ["nodejs_compat", "enable_request_signal"],
	exports: {
		MapshotWorkerPortal: workerExports.worker({ cache: { enabled: false } }),
		MapshotContainer: workerExports.durableObject({ storage: "sqlite" }),
		ContainerProxy: workerExports.worker({ cache: { enabled: false } }),
	},
}));

const _container = defineContainer(({ mode }) => {
	const environment = _modeSchema.parse(mode);
	const image = process.env["MAPSHOT_CONTAINER_IMAGE"];
	return {
		name: `cataqui-mapshot-${environment}`,
		image: image ? { reference: image } : { dockerfile: "../Dockerfile", buildContext: "../../.." },
		schedulingPolicy: "default",
		instanceType: "standard-3",
		maxInstances: 1,
	};
});

const _config = defineConfig({
	accountId: "1fca946385505503c59dd6a2a4eeb442",
	containers: [_container],
	worker: (context) => {
		const environment = _modeSchema.parse(context.mode);
		const definition = worker(context);
		return {
			...definition,
			workersDev: false,
			previewUrls: false,
			exports: {
				...definition.exports,
				MapshotContainer: workerExports.durableObject({ storage: "sqlite", container: _container }),
			},
			env: {
				R2: bindings.r2({ name: `cataqui-mapshot-${environment}` }),
				ENVIRONMENT: bindings.text(environment),
				...{
					development: { SLEEP_AFTER_MS: bindings.json(600000) },
					staging: { SLEEP_AFTER_MS: bindings.json(600000) },
					production: {},
				}[environment],
			},
			observability: {
				enabled: true,
				logs: { enabled: true, headSamplingRate: 1, invocationLogs: false },
			},
		};
	},
});

export type MapshotWorkerEnv = InferEnv<ReturnType<typeof _config.worker>>;

export default _config;
