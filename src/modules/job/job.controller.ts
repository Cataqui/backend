import { Controller, Get, Post, Param, Version, Body, HttpCode, HttpStatus } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { JobService } from "./job.service";
import { CreateJobRequestDto } from "./dto/create-job-request.dto";
import { GetJobRequestParamsDto } from "./dto/get-job-request-params.dto";
import { JobOutputDto } from "./dto/job-output.dto";
import { ApiCreateJobDocs } from "./decorators/api-create-job-docs.decorator";
import { ApiGetJobDocs } from "./decorators/api-get-job-docs.decorator";
import { RequestLocale } from "../../shared/locale/request-locale.decorator";

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

	@Post()
	@Version("1")
	@HttpCode(HttpStatus.CREATED)
	@ApiCreateJobDocs()
	async create(@Body() dto: CreateJobRequestDto, @RequestLocale() locale: string): Promise<JobOutputDto> {
		return this._jobService.createJob(dto, locale);
	}
}
