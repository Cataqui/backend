import { ContainerProxy, getRandom } from "@cloudflare/containers";
import { ApiContainer } from "../../containers/api/api-container";
import { routeQueueBatch } from "../../queues/queue";

export { ApiContainer, ContainerProxy };

const worker = {
	async fetch(request: Request, env: ApiWorkerEnv): Promise<Response> {
		const container = await getRandom(env.API_CONTAINER, Number(env.API_CONTAINER_POOL_SIZE));
		return container.fetch(request);
	},

	async queue(batch: MessageBatch<unknown>, env: ApiWorkerEnv): Promise<void> {
		await routeQueueBatch({
			batch: batch,
			environment: env.NODE_ENV,
			deliver: async ({ url, requestOptions }) => {
				const container = await getRandom(env.API_CONTAINER, Number(env.API_CONTAINER_POOL_SIZE));
				return container.containerFetch(url, requestOptions);
			},
		});
	},
} satisfies ExportedHandler<ApiWorkerEnv>;

export default worker;
