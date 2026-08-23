import { ContainerProxy, getRandom } from "@cloudflare/containers";
import { WorkerEntrypoint } from "cloudflare:workers";
import { ApiContainer } from "../../containers/api/api-container";
import type {
	ApiContainerInboundCall,
	ApiContainerInboundReceiver,
} from "../../containers/api/inbound/api-container-inbound.manifest";
import { routeInboundCall } from "../../containers/api/inbound/api-container-inbound.router";
import { routeQueueBatch } from "../../queues/queue";

export { ApiContainer, ContainerProxy };

export class ApiContainerInboundEntrypoint extends WorkerEntrypoint<ApiWorkerEnv> {
	async deliverInbound<Receiver extends ApiContainerInboundReceiver>(
		params: ApiContainerInboundCall<Receiver>,
	): Promise<Response> {
		return routeInboundCall({
			receiver: params.receiver,
			body: params.body,
			deliver: async ({ url, requestOptions }) => {
				const container = await getRandom(this.env.API_CONTAINER, Number(this.env.API_CONTAINER_POOL_SIZE));
				return container.containerFetch(url, requestOptions);
			},
		});
	}
}

export class MicroservicesAuthJwksEntrypoint extends WorkerEntrypoint<ApiWorkerEnv> {
	async fetch(request: Request): Promise<Response> {
		const container = await getRandom(this.env.API_CONTAINER, Number(this.env.API_CONTAINER_POOL_SIZE));
		const response = await container.fetch(request);
		if (response.status === 200) return response;

		const uncachedResponse = new Response(response.body, response);
		uncachedResponse.headers.set("Cache-Control", "no-store");
		return uncachedResponse;
	}
}

const worker = {
	async fetch(request: Request, env: ApiWorkerEnv, context: ExecutionContext): Promise<Response> {
		if (request.method === "GET" && new URL(request.url).pathname === "/v1/auth/microservices/jwks") {
			return context.exports.MicroservicesAuthJwksEntrypoint.fetch(request);
		}

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
