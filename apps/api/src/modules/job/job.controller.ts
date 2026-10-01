import {
	BadRequestException,
	Body,
	Controller,
	Get,
	Header,
	Headers,
	HttpCode,
	HttpStatus,
	Param,
	Post,
	Version,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { RateLimit } from "../../core/throttle/rate-limit.decorator";
import { CurrentAuthSession } from "../auth/decorators/current-auth-session.decorator";
import { AccessTokenRequired } from "../auth/decorators/access-token-required.decorator";
import type { IAuthenticatedSession } from "../auth/interfaces/authenticated-session.interface";
import { ContactOutputSchema } from "../contact/schemas/contact-output.schema";
import { ApiArchiveJobDocs } from "./decorators/api-archive-job-docs.decorator";
import { ApiActivateJobDocs } from "./decorators/api-activate-job-docs.decorator";
import { ApiCreateJobDocs } from "./decorators/api-create-job-docs.decorator";
import { ApiGetJobContactDocs } from "./decorators/api-get-job-contact-docs.decorator";
import { ApiGetJobDocs } from "./decorators/api-get-job-docs.decorator";
import { JobService } from "./job.service";
import { CreateJobInputSchema } from "./schemas/create-job-input.schema";
import { GetJobInputSchema } from "./schemas/get-job-input.schema";
import { GetJobContactInputSchema } from "./schemas/get-job-contact-input.schema";
import { PublicJobOutputSchema } from "./schemas/public-job-output.schema";

@ApiTags("jobs")
@Controller("jobs")
export class JobController {
	constructor(private readonly _jobService: JobService) {}

	@Post()
	@Version("1")
	@RateLimit({ requests: 20, per: "hour" })
	@HttpCode(HttpStatus.CREATED)
	@ApiCreateJobDocs()
	async createJob(
		@Body({ schema: CreateJobInputSchema }) dto: z.infer<typeof CreateJobInputSchema>,
		@Headers("idempotency-key") idempotencyKey: string | undefined,
		@CurrentAuthSession() authSession: IAuthenticatedSession,
	): Promise<z.infer<typeof PublicJobOutputSchema>> {
		const parsedKey = z.uuid().safeParse(idempotencyKey);
		if (!parsedKey.success) throw new BadRequestException("Idempotency-Key must be a UUID.");
		return this._jobService.createJob({ dto: dto, idempotencyKey: parsedKey.data, posterUserId: authSession.userId });
	}

	@Get(":jobId")
	@Version("1")
	@HttpCode(HttpStatus.OK)
	@ApiGetJobDocs()
	async getJob(
		@Param({ schema: GetJobInputSchema }) params: z.infer<typeof GetJobInputSchema>,
	): Promise<z.infer<typeof PublicJobOutputSchema>> {
		return this._jobService.getPublicJob({ jobId: params.jobId });
	}

	@Post(":jobId/archive")
	@Version("1")
	@AccessTokenRequired()
	@HttpCode(HttpStatus.OK)
	@ApiArchiveJobDocs()
	async archiveJob(
		@Param({ schema: GetJobInputSchema }) params: z.infer<typeof GetJobInputSchema>,
		@CurrentAuthSession() authSession: IAuthenticatedSession,
	): Promise<z.infer<typeof PublicJobOutputSchema>> {
		return this._jobService.archiveJob({ jobId: params.jobId, posterUserId: authSession.userId });
	}

	@Post(":jobId/activate")
	@Version("1")
	@AccessTokenRequired()
	@HttpCode(HttpStatus.OK)
	@ApiActivateJobDocs()
	async activateJob(
		@Param({ schema: GetJobInputSchema }) params: z.infer<typeof GetJobInputSchema>,
		@CurrentAuthSession() authSession: IAuthenticatedSession,
	): Promise<z.infer<typeof PublicJobOutputSchema>> {
		return this._jobService.activateJob({ jobId: params.jobId, posterUserId: authSession.userId });
	}

	@Get(":jobId/contact/:contactId")
	@Version("1")
	@HttpCode(HttpStatus.OK)
	@Header("Cache-Control", "no-store")
	@ApiGetJobContactDocs()
	async getJobContact(
		@Param({ schema: GetJobContactInputSchema }) params: z.infer<typeof GetJobContactInputSchema>,
	): Promise<z.infer<typeof ContactOutputSchema>> {
		return this._jobService.getJobContact({ jobId: params.jobId, contactId: params.contactId });
	}
}
