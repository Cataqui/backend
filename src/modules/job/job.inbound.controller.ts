import { InboundController } from "@/core/inbound/inbound-controller.decorator";
import { InboundReceiver } from "@/core/inbound/inbound-receiver.decorator";
import { DeriveJobDataInputSchema } from "@/platform/cloudflare/containers/api/inbound/schemas/derive-job-data-input.schema";
import { Body } from "@nestjs/common";
import type { z } from "zod";
import { JobService } from "./job.service";

@InboundController()
export class JobInboundController {
	constructor(private readonly _jobService: JobService) {}

	@InboundReceiver("derive-job-data")
	async deriveData(
		@Body({ schema: DeriveJobDataInputSchema }) message: z.infer<typeof DeriveJobDataInputSchema>,
	): Promise<void> {
		await this._jobService.deriveDataForJob({ jobId: message.jobId });
	}
}
