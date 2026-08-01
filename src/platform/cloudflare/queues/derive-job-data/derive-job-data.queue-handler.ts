import { getContainer } from "@cloudflare/containers";
import type { IQueueHandler } from "../queue-handler.interface";
import { DeriveJobDataQueueConstants } from "./derive-job-data-queue.constants";
import { DeriveJobDataMessageSchema } from "./derive-job-data-message.schema";

async function _handle(params: { batch: MessageBatch<unknown>; env: Env; context: ExecutionContext }): Promise<void> {
	const container = getContainer(params.env.API_CONTAINER);

	for (const message of params.batch.messages) {
		const deriveJobDataMessageResult = DeriveJobDataMessageSchema.safeParse(message.body);

		if (!deriveJobDataMessageResult.success) {
			console.error({
				event: "job_data_derivation.queue_message_invalid",
				messageId: message.id,
			});

			message.retry();
			continue;
		}

		const deriveJobDataMessage = deriveJobDataMessageResult.data;
		let status: number | null = null;

		try {
			const response = await container.containerFetch(
				`http://localhost/internal/job/${encodeURIComponent(deriveJobDataMessage.job_id)}/${DeriveJobDataQueueConstants.INTERNAL_ROUTE}`,
				{ method: "POST" },
			);

			if (response.ok) {
				message.ack();
				continue;
			}

			status = response.status;
		} catch {
			// Transport failures do not have an HTTP response status.
		}

		console.error({
			event: "job_data_derivation.queue_consume_failed",
			jobId: deriveJobDataMessage.job_id,
			status: status,
		});
		message.retry();
	}
}

export const DeriveJobDataHandler: IQueueHandler = {
	handle: _handle,
};
