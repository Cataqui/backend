import { Controller, Post, Version, Body, HttpCode, HttpStatus } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { JobService } from "./job.service";
import { CreateJobRequestDto } from "./dto/create-job-request.dto";
import { JobOutputDto } from "./dto/job-output.dto";
import { ApiCreateJobDocs } from "./decorators/api-create-job-docs.decorator";
import { RequestLocale } from "../../shared/locale/request-locale.decorator";

@ApiTags("jobs")
@Controller("job")
export class JobController {
	constructor(private readonly _jobService: JobService) {}

	@Post("create")
	@Version("1")
	@HttpCode(HttpStatus.CREATED)
	@ApiCreateJobDocs()
	async create(@Body() dto: CreateJobRequestDto, @RequestLocale() locale: string): Promise<JobOutputDto> {
		return this._jobService.createJob(dto, locale);
	}
}
