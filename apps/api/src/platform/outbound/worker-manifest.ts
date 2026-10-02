import { GenerateStaticMapsInputSchema, GenerateStaticMapsResultSchema, type IMapsRpc } from "@cataqui/maps-contracts";
import type { ApiWorkerEnvironment } from "../../../api-worker-environment";
import { defineWorkerMethod } from "./define-worker-method";
import type { WorkerCallRegistry } from "./worker-call.types";

export const WorkerManifest = {
	maps: {
		host: "maps.internal",
		methods: {
			generateStaticMaps: defineWorkerMethod({
				input: GenerateStaticMapsInputSchema,
				result: GenerateStaticMapsResultSchema,
				async execute(params) {
					// Wrangler exposes external entrypoints as an unparameterized Service.
					const worker = params.env.MAPS as ApiWorkerEnvironment["MAPS"] & IMapsRpc;
					return worker.generateStaticMaps(params.input);
				},
			}),
		},
	},
} as const satisfies WorkerCallRegistry;
