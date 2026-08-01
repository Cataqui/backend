import { ContainerProxy, getContainer } from "@cloudflare/containers";
import { ApiContainer } from "./container/api-container";
import { QueueRouter } from "./queues/queue-router";

export { ApiContainer, ContainerProxy };

const worker = {
	async fetch(request: Request, env: Env): Promise<Response> {
		const container = getContainer(env.API_CONTAINER);
		return container.fetch(request);
	},

	async queue(batch: MessageBatch<unknown>, env: Env, context: ExecutionContext): Promise<void> {
		await QueueRouter.route({ batch: batch, env: env, context: context });
	},
} satisfies ExportedHandler<Env>;

export default worker;
