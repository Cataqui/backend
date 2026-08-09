import { DeriveJobDataQueueMessageSchema } from "@/platform/cloudflare/queues/schemas/derive-job-data-queue-message.schema";
import { Body } from "@nestjs/common";
import type { z } from "zod";
import { QueueConsumer } from "../../core/queue/queue-consumer.decorator";
import { QueueController } from "../../core/queue/queue-controller.decorator";
import { JobService } from "./job.service";

@QueueController()
export class JobQueueController {
	constructor(private readonly _jobService: JobService) {}

	@QueueConsumer("cataqui-api-derive-job-data")
	async deriveData(
		@Body({ schema: DeriveJobDataQueueMessageSchema }) message: z.infer<typeof DeriveJobDataQueueMessageSchema>,
	): Promise<void> {
		await this._jobService.deriveDataForJob({ jobId: message.jobId });
	}
}
