import { apiContainerInboundManifest } from "../inbound/api-container-inbound.manifest.js";
import { getInboundCallUrl } from "../inbound/utils.js";
import { queueManifest, type QueueName } from "./queue.manifest.js";

function _isQueueName(value: string | null): value is QueueName {
	return value !== null && Object.hasOwn(queueManifest, value);
}

export async function routeQueueBatch(params: {
	batch: MessageBatch<unknown>;
	environment: string;
	deliver: (params: { url: string; requestOptions: RequestInit }) => Promise<Response>;
}): Promise<{ acknowledgedMessageCount: number; invalidMessageCount: number; retriedMessageCount: number }> {
	const environmentSuffix = `-${params.environment}`;
	const queueBaseName = params.batch.queue.endsWith(environmentSuffix)
		? params.batch.queue.slice(0, -environmentSuffix.length)
		: null;

	if (_isQueueName(queueBaseName)) {
		const queueManifestEntry = queueManifest[queueBaseName];
		const inboundManifestEntry = apiContainerInboundManifest[queueManifestEntry.inboundReceiver];
		let acknowledgedMessageCount = 0;
		let invalidMessageCount = 0;
		let retriedMessageCount = 0;

		for (const message of params.batch.messages) {
			const messageResult = inboundManifestEntry.bodySchema.safeParse(message.body);

			if (!messageResult.success) {
				console.error({ event: "queue.message.invalid", queue: params.batch.queue });

				invalidMessageCount += 1;
				retriedMessageCount += 1;
				message.retry();
				continue;
			}

			let responseStatus: number | null = null;

			try {
				const response = await params.deliver({
					url: getInboundCallUrl({ receiver: queueManifestEntry.inboundReceiver }),
					requestOptions: {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(messageResult.data),
					},
				});

				if (response.ok) {
					acknowledgedMessageCount += 1;
					message.ack();
					continue;
				}

				responseStatus = response.status;
			} catch {
				// Transport failures do not have an HTTP response status and must be retried.
			}

			console.error({
				event: "queue.delivery.failed",
				queue: params.batch.queue,
				responseStatus: responseStatus,
			});
			retriedMessageCount += 1;
			message.retry();
		}

		return {
			acknowledgedMessageCount: acknowledgedMessageCount,
			invalidMessageCount: invalidMessageCount,
			retriedMessageCount: retriedMessageCount,
		};
	}

	params.batch.retryAll();
	return {
		acknowledgedMessageCount: 0,
		invalidMessageCount: 0,
		retriedMessageCount: params.batch.messages.length,
	};
}
