import { DeriveJobDataQueueConstants } from "./derive-job-data/derive-job-data-queue.constants";
import { DeriveJobDataHandler } from "./derive-job-data/derive-job-data.queue-handler";
import type { IQueueHandler } from "./queue-handler.interface";

const _HANDLERS_BY_QUEUE_NAME = new Map<string, IQueueHandler>([
	[DeriveJobDataQueueConstants.BASE_NAME, DeriveJobDataHandler],
]);

async function _route(params: { batch: MessageBatch<unknown>; env: Env; context: ExecutionContext }): Promise<void> {
	const handler = _HANDLERS_BY_QUEUE_NAME.get(params.batch.queue.replace(/-(staging|production)$/, ""));

	if (handler !== undefined) {
		await handler.handle({ batch: params.batch, env: params.env, context: params.context });

		return;
	}

	console.error({
		event: "queue.routing_failed",
		queue: params.batch.queue,
	});

	params.batch.retryAll();
}

export const QueueRouter = {
	route: _route,
} as const;
