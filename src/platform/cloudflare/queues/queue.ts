import { getQueueConsumerPath, queueManifest } from "./queue.manifest";

export async function enqueueMessages<MessageBody>(params: {
	messages: MessageBody[];
	queue: Queue<MessageBody>;
}): Promise<void> {
	const results = await Promise.allSettled(params.messages.map((message) => params.queue.send(message)));
	if (results.every((result) => result.status === "fulfilled")) return;

	throw new Error("One or more messages could not be queued");
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

	const queueManifestEntry = queueManifest.find((entry) => entry.queueBaseName === queueBaseName);

	if (queueManifestEntry !== undefined) {
		for (const message of params.batch.messages) {
			const messageResult = queueManifestEntry.messageSchema.safeParse(message.body);

			if (!messageResult.success) {
				console.error({ event: "queue.message_invalid", queue: params.batch.queue, messageId: message.id });

				message.retry();
				continue;
			}

			let responseStatus: number | null = null;

			try {
				const response = await params.deliver({
					url: `http://localhost/${getQueueConsumerPath({ queueName: queueManifestEntry.queueBaseName })}`,
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
