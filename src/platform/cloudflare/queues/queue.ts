import { apiContainerInboundManifest } from "../containers/api/inbound/api-container-inbound.manifest";
import { getInboundCallUrl } from "../containers/api/inbound/utils";
import { queueManifest, type QueueName } from "./queue.manifest";

function _isQueueName(value: string | null): value is QueueName {
	return value !== null && Object.hasOwn(queueManifest, value);
}

export async function routeQueueBatch(params: {
	batch: MessageBatch<unknown>;
	environment: string;
	deliver: (params: { url: string; requestOptions: RequestInit }) => Promise<Response>;
}): Promise<void> {
	const environmentSuffix = `-${params.environment}`;
	const queueBaseName = params.batch.queue.endsWith(environmentSuffix)
		? params.batch.queue.slice(0, -environmentSuffix.length)
		: null;

	if (_isQueueName(queueBaseName)) {
		const queueManifestEntry = queueManifest[queueBaseName];
		const inboundManifestEntry = apiContainerInboundManifest[queueManifestEntry.inboundReceiver];

		for (const message of params.batch.messages) {
			const messageResult = inboundManifestEntry.bodySchema.safeParse(message.body);

			if (!messageResult.success) {
				console.error({ event: "queue.message_invalid", queue: params.batch.queue, messageId: message.id });

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
					message.ack();
					continue;
				}

				responseStatus = response.status;
			} catch {
				// Transport failures do not have an HTTP response status and must be retried.
			}

			console.error({
				event: "queue.delivery_failed",
				queue: params.batch.queue,
				messageId: message.id,
				responseStatus: responseStatus,
			});
			message.retry();
		}

		return;
	}

	params.batch.retryAll();
}
