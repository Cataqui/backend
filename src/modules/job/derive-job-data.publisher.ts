import { Injectable, Logger } from "@nestjs/common";
import { DeriveJobDataQueueConstants } from "../../platform/cloudflare/queues/derive-job-data/derive-job-data-queue.constants";
import type { DeriveJobDataMessage } from "../../platform/cloudflare/queues/derive-job-data/derive-job-data-message.schema";

@Injectable()
export class DeriveJobDataPublisher {
	private readonly _logger = new Logger(DeriveJobDataPublisher.name);

	async publish(params: { jobId: string }): Promise<void> {
		let status: number | null = null;

		try {
			const response = await fetch(`http://${DeriveJobDataQueueConstants.OUTBOUND_HOST}`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ job_id: params.jobId } satisfies DeriveJobDataMessage),
			});

			if (response.ok) return;

			status = response.status;
		} catch {
			// Transport failures do not have an HTTP response status.
		}

		this._logger.error({
			event: "job_data_derivation.queue_publish_failed",
			jobId: params.jobId,
			status: status,
		});
	}
}
