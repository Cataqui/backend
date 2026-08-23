import { DeriveJobDataInputSchema } from "@cataqui/api-internal-ingress";
import { Body } from "@nestjs/common";
import type { z } from "zod";
import { InboundController } from "../../core/inbound/inbound-controller.decorator";
import { InboundReceiver } from "../../core/inbound/inbound-receiver.decorator";
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
