import type { AuthenticatedSession } from "@cataqui/auth-schemas";
import { Body, Controller, Get, Header, HttpCode, HttpStatus, Param, Query, Post, Res, Version } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { FastifyReply } from "fastify";
import type { z } from "zod";
import type { PaginatedResult } from "../../shared/results/paginated-result";
import { JobService } from "../job/job.service";
import { GetJobInputSchema } from "../job/schemas/get-job-input.schema";
import type { ProfileJobOutputSchema } from "../job/schemas/profile-job-output.schema";
import type { ProfileJobSummaryOutputSchema } from "../job/schemas/profile-job-summary-output.schema";
import { ApiGetProfileJobDocs } from "./decorators/api-get-profile-job-docs.decorator";
import { ApiGetProfileJobsDocs } from "./decorators/api-get-profile-jobs-docs.decorator";
import { ProfileJobsInputSchema } from "./schemas/profile-jobs-input.schema";
import { CurrentAuthSession } from "../authentication/decorators/current-auth-session.decorator";
import { ContactService } from "../contact/contact.service";
import type { SavedContactsOutputSchema } from "../contact/schemas/saved-contacts-output.schema";
import { ApiCreateProfileDocs } from "./decorators/api-create-profile-docs.decorator";
import { ApiGetCurrentProfileContactsDocs } from "./decorators/api-get-current-profile-contacts-docs.decorator";
import { ApiGetCurrentProfileDocs } from "./decorators/api-get-current-profile-docs.decorator";
import { ProfileService } from "./profile.service";
import { CreateProfileInputSchema } from "./schemas/create-profile-input.schema";
import type { ProfileOutputSchema } from "./schemas/profile-output.schema";

@ApiTags("profile")
@Controller("profiles")
export class ProfileController {
	constructor(
		private readonly _profileService: ProfileService,
		private readonly _contactService: ContactService,
		private readonly _jobService: JobService,
	) {}

	@Post()
	@Version("1")
	@Header("Cache-Control", "no-store")
	@ApiCreateProfileDocs()
	async createProfile(
		@Body({ schema: CreateProfileInputSchema }) input: z.infer<typeof CreateProfileInputSchema>,
		@CurrentAuthSession() authSession: AuthenticatedSession,
		@Res({ passthrough: true }) reply: FastifyReply,
	): Promise<z.infer<typeof ProfileOutputSchema>> {
		const result = await this._profileService.create({ profileId: authSession.accountId, input: input });
		reply.code(result.created ? HttpStatus.CREATED : HttpStatus.OK);
		return result.profile;
	}

	@Get("me")
	@Version("1")
	@Header("Cache-Control", "no-store")
	@HttpCode(HttpStatus.OK)
	@ApiGetCurrentProfileDocs()
	async getCurrentProfile(
		@CurrentAuthSession() authSession: AuthenticatedSession,
	): Promise<z.infer<typeof ProfileOutputSchema>> {
		return this._profileService.getCurrent({ profileId: authSession.accountId });
	}

	@Get("me/contacts")
	@Version("1")
	@Header("Cache-Control", "no-store")
	@HttpCode(HttpStatus.OK)
	@ApiGetCurrentProfileContactsDocs()
	async getContacts(
		@CurrentAuthSession() authSession: AuthenticatedSession,
	): Promise<z.infer<typeof SavedContactsOutputSchema>> {
		return this._contactService.getContacts({ ownerProfileId: authSession.accountId });
	}

	@Get("me/jobs")
	@Version("1")
	@Header("Cache-Control", "no-store")
	@HttpCode(HttpStatus.OK)
	@ApiGetProfileJobsDocs()
	async getProfileJobs(
		@Query({ schema: ProfileJobsInputSchema }) query: z.infer<typeof ProfileJobsInputSchema>,
		@CurrentAuthSession() authSession: AuthenticatedSession,
	): Promise<PaginatedResult<z.infer<typeof ProfileJobSummaryOutputSchema>>> {
		return this._jobService.getProfileJobs({ posterProfileId: authSession.accountId, cursor: query.cursor });
	}

	@Get("me/jobs/:jobId")
	@Version("1")
	@Header("Cache-Control", "no-store")
	@HttpCode(HttpStatus.OK)
	@ApiGetProfileJobDocs()
	async getProfileJob(
		@Param({ schema: GetJobInputSchema }) params: z.infer<typeof GetJobInputSchema>,
		@CurrentAuthSession() authSession: AuthenticatedSession,
	): Promise<z.infer<typeof ProfileJobOutputSchema>> {
		return this._jobService.getProfileJob({ jobId: params.jobId, posterProfileId: authSession.accountId });
	}
}
