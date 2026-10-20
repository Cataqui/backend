import { type InferEnv, defineConfig, defineContainer, defineWorker, exports } from "cf/config";
import * as entrypoint from "./test/fixture-worker.ts" with { type: "cf-worker" };

const container = defineContainer({
	name: "cataqui-workerhole-local-test-fixturecontainer",
	image: { dockerfile: "./test/Dockerfile" },
	maxInstances: 1,
	instanceType: "lite",
});

const _worker = defineWorker({
	name: "cataqui-workerhole-local-test",
	entrypoint: entrypoint,
	compatibilityDate: "2026-10-07",
	compatibilityFlags: ["nodejs_compat"],
	exports: {
		FixtureContainer: exports.durableObject({
			storage: "sqlite",
			container: container,
		}),
	},
});

const _config = defineConfig({
	worker: _worker,
	containers: [container],
});

export type FixtureWorkerEnv = InferEnv<typeof _config.worker>;

export default _config;
