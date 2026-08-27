import { Body, Controller, Get, Header, HttpCode, HttpStatus, Param, Patch, Post, Version } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { z } from "zod";
import { RateLimit } from "../../core/throttle/rate-limit.decorator";
import { ProductAnalyticsEvent } from "../../core/observability/product-analytics-event.decorator";
import { ProductAnalyticsEventName } from "../../core/observability/product-analytics-event-name.enum";
import { CurrentAuthSession } from "../auth/decorators/current-auth-session.decorator";
import type { IAuthenticatedSession } from "../auth/interfaces/authenticated-session.interface";
import { ApiCreateJobDraftDocs } from "./decorators/api-create-job-draft-docs.decorator";
import { ApiGetJobContactDocs } from "./decorators/api-get-job-contact-docs.decorator";
import { ApiGetJobDocs } from "./decorators/api-get-job-docs.decorator";
import { ApiPublishJobDocs } from "./decorators/api-publish-job-docs.decorator";
import { ApiUpdateJobDraftDocs } from "./decorators/api-update-job-draft-docs.decorator";
import { ApiUpdateJobDocs } from "./decorators/api-update-job-docs.decorator";
import { JobService } from "./job.service";
import { CreateJobDraftInputSchema } from "./schemas/create-job-draft-input.schema";
import { DraftJobOutputSchema } from "./schemas/draft-job-output.schema";
import { GetJobContactInputSchema } from "./schemas/get-job-contact-input.schema";
import { GetJobInputSchema } from "./schemas/get-job-input.schema";
import { JobContactOutputSchema } from "./schemas/job-contact-output.schema";
import { PublicJobOutputSchema } from "./schemas/public-job-output.schema";
import { UpdateJobInputSchema } from "./schemas/update-job-input.schema";

@ApiTags("jobs")
@Controller("jobs")
export class JobController {
	constructor(private readonly _jobService: JobService) {}

	@Get(":jobId")
	@Version("1")
	@HttpCode(HttpStatus.OK)
	@ProductAnalyticsEvent({ eventName: ProductAnalyticsEventName.JOB_DETAIL_READ_REQUEST_SUCCEEDED })
	@ApiGetJobDocs()
	async getJob(
		@Param({ schema: GetJobInputSchema }) params: z.infer<typeof GetJobInputSchema>,
	): Promise<z.infer<typeof PublicJobOutputSchema>> {
		return this._jobService.getPublicJob({ jobId: params.jobId });
	}

	@Get(":jobId/contact/:contactId")
	@Version("1")
	@HttpCode(HttpStatus.OK)
	@Header("Cache-Control", "no-store")
	@ProductAnalyticsEvent({ eventName: ProductAnalyticsEventName.JOB_CONTACT_REVEAL_REQUEST_SUCCEEDED })
	@ApiGetJobContactDocs()
	async getJobContact(
		@Param({ schema: GetJobContactInputSchema })
		params: z.infer<typeof GetJobContactInputSchema>,
	): Promise<z.infer<typeof JobContactOutputSchema>> {
		return this._jobService.getActiveJobContact({ contactId: params.contactId, jobId: params.jobId });
	}

	@Post("drafts")
	@Version("1")
	@RateLimit({ requests: 20, per: "hour" })
	@HttpCode(HttpStatus.CREATED)
	@ProductAnalyticsEvent({ eventName: ProductAnalyticsEventName.JOB_DRAFT_CREATE_REQUEST_SUCCEEDED })
	@ApiCreateJobDraftDocs()
	async createDraft(
		@Body({ schema: CreateJobDraftInputSchema }) dto: z.infer<typeof CreateJobDraftInputSchema>,
		@CurrentAuthSession() authSession: IAuthenticatedSession,
	): Promise<z.infer<typeof DraftJobOutputSchema>> {
		return this._jobService.createDraft({ dto: dto, posterUserId: authSession.userId });
	}

	@Patch("drafts/:jobId")
	@Version("1")
	@RateLimit({ requests: 60, per: "hour" })
	@HttpCode(HttpStatus.OK)
	@ProductAnalyticsEvent({ eventName: ProductAnalyticsEventName.JOB_DRAFT_UPDATE_REQUEST_SUCCEEDED })
	@ApiUpdateJobDraftDocs()
	async updateDraft(
		@Param({ schema: GetJobInputSchema }) params: z.infer<typeof GetJobInputSchema>,
		@Body({ schema: UpdateJobInputSchema }) dto: z.infer<typeof UpdateJobInputSchema>,
		@CurrentAuthSession() authSession: IAuthenticatedSession,
	): Promise<z.infer<typeof DraftJobOutputSchema>> {
		return this._jobService.updateDraft({
			jobId: params.jobId,
			updatedDto: dto,
			posterUserId: authSession.userId,
		});
	}

	@Patch(":jobId")
	@Version("1")
	@RateLimit({ requests: 60, per: "hour" })
	@HttpCode(HttpStatus.OK)
	@ProductAnalyticsEvent({ eventName: ProductAnalyticsEventName.JOB_UPDATE_REQUEST_SUCCEEDED })
	@ApiUpdateJobDocs()
	async updatePublicJob(
		@Param({ schema: GetJobInputSchema }) params: z.infer<typeof GetJobInputSchema>,
		@Body({ schema: UpdateJobInputSchema }) dto: z.infer<typeof UpdateJobInputSchema>,
		@CurrentAuthSession() authSession: IAuthenticatedSession,
	): Promise<z.infer<typeof PublicJobOutputSchema>> {
		return this._jobService.updatePublicJob({
			jobId: params.jobId,
			updatedDto: dto,
			posterUserId: authSession.userId,
		});
	}

	@Post(":jobId/publish")
	@Version("1")
	@RateLimit({ requests: 20, per: "hour" })
	@HttpCode(HttpStatus.OK)
	@ProductAnalyticsEvent({ eventName: ProductAnalyticsEventName.JOB_PUBLISH_REQUEST_SUCCEEDED })
	@ApiPublishJobDocs()
	async publish(
		@Param({ schema: GetJobInputSchema }) params: z.infer<typeof GetJobInputSchema>,
		@CurrentAuthSession() authSession: IAuthenticatedSession,
	): Promise<z.infer<typeof PublicJobOutputSchema>> {
		return this._jobService.publishJob({
			jobId: params.jobId,
			posterUserId: authSession.userId,
		});
	}
}
