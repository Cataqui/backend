import { Controller, HttpCode, HttpStatus, Param, Post, VERSION_NEUTRAL, Version } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { DeriveJobDataQueueConstants } from "../../platform/cloudflare/queues/derive-job-data/derive-job-data-queue.constants";
import { GetJobRequestParamsDto } from "./dto/get-job-request-params.dto";
import { JobService } from "./job.service";

@ApiExcludeController()
@Controller("internal/job")
export class JobInternalController {
	constructor(private readonly _jobService: JobService) {}

	@Post(`:job_id/${DeriveJobDataQueueConstants.INTERNAL_ROUTE}`)
	@Version(VERSION_NEUTRAL)
	@HttpCode(HttpStatus.NO_CONTENT)
	async deriveData(@Param() params: GetJobRequestParamsDto): Promise<void> {
		await this._jobService.deriveDataForJob({ jobId: params.jobId });
	}
}
