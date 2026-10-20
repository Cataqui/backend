import type { ApiWorkerEnv } from "../cloudflare.config.ts";
import { WorkerPortal } from "@cataqui/workerhole/worker";
import type { ApiWorkerPortal as ApiWorkerPortalDefinition } from "@cataqui/api-workerhole";

export class ApiWorkerPortal extends WorkerPortal<ApiWorkerEnv, typeof ApiWorkerPortalDefinition> {
	override readonly expose: WorkerPortal<ApiWorkerEnv, typeof ApiWorkerPortalDefinition>["expose"] = {
		getStaticMapLocationUrl: async (input) => {
			const result = await this.env.MAPS.getStaticMapLocationUrl({
				latitude: input.latitude,
				longitude: input.longitude,
			});
			return { url: result.url };
		},
	};
}
