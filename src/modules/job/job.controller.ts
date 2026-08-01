import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Version } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { RequestLocale } from "../../shared/locale/request-locale.decorator";
import { ApiCreateJobDraftDocs } from "./decorators/api-create-job-draft-docs.decorator";
import { ApiGetJobContactDocs } from "./decorators/api-get-job-contact-docs.decorator";
import { ApiGetJobDocs } from "./decorators/api-get-job-docs.decorator";
import { ApiPublishJobDocs } from "./decorators/api-publish-job-docs.decorator";
import { ApiUpdateJobDocs } from "./decorators/api-update-job-docs.decorator";
import { CreateJobDraftRequestDto } from "./dto/create-job-draft-request.dto";
import { GetJobContactRequestParamsDto } from "./dto/get-job-contact-request-params.dto";
import { GetJobRequestParamsDto } from "./dto/get-job-request-params.dto";
import { JobContactOutputDto } from "./dto/job-contact-output.dto";
import { JobOutputDto } from "./dto/job-output.dto";
import { UpdateJobRequestDto } from "./dto/update-job-request.dto";
import { JobService } from "./job.service";

@ApiTags("jobs")
@Controller("job")
export class JobController {
	constructor(private readonly _jobService: JobService) {}

	@Get(":job_id")
	@Version("1")
	@HttpCode(HttpStatus.OK)
	@ApiGetJobDocs()
	async getJob(@Param() params: GetJobRequestParamsDto, @RequestLocale() locale: string): Promise<JobOutputDto> {
		return this._jobService.getJob({ jobId: params.jobId, locale });
	}

	@Get(":job_id/contact/:contact_id")
	@Version("1")
	@HttpCode(HttpStatus.OK)
	@ApiGetJobContactDocs()
	async getJobContact(@Param() params: GetJobContactRequestParamsDto): Promise<JobContactOutputDto> {
		return this._jobService.getJobContact({ contactId: params.contactId, jobId: params.jobId });
	}

	@Post("draft")
	@Version("1")
	@Throttle({
		default: {
			limit: 5,
			ttl: 60_000,
		},
	})
	@HttpCode(HttpStatus.CREATED)
	@ApiCreateJobDraftDocs()
	async createDraft(@Body() dto: CreateJobDraftRequestDto): Promise<JobOutputDto> {
		return this._jobService.createDraft({ dto: dto });
	}

	@Patch(":job_id")
	@Version("1")
	@HttpCode(HttpStatus.OK)
	@ApiUpdateJobDocs()
	async update(
		@Param() params: GetJobRequestParamsDto,
		@Body() dto: UpdateJobRequestDto,
		@RequestLocale() locale: string,
	): Promise<JobOutputDto> {
		return this._jobService.updateJob({ jobId: params.jobId, updatedDto: dto, locale: locale });
	}

	@Post(":job_id/publish")
	@Version("1")
	@HttpCode(HttpStatus.OK)
	@ApiPublishJobDocs()
	async publish(@Param() params: GetJobRequestParamsDto, @RequestLocale() locale: string): Promise<JobOutputDto> {
		return this._jobService.publishJob({ jobId: params.jobId, locale: locale });
	}
}
