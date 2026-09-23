import { Controller, Get, Header, HttpCode, HttpStatus, Query, Version } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { z } from "zod";
import type { PaginatedResult } from "../../shared/results/paginated-result";
import { AccessTokenRequired } from "../auth/decorators/access-token-required.decorator";
import { CurrentAuthSession } from "../auth/decorators/current-auth-session.decorator";
import type { IAuthenticatedSession } from "../auth/interfaces/authenticated-session.interface";
import { ContactService } from "../contact/contact.service";
import { SavedContactsOutputSchema } from "../contact/schemas/saved-contacts-output.schema";
import { JobService } from "../job/job.service";
import { UserJobOutputSchema } from "../job/schemas/user-job-output.schema";
import { UserJobsInputSchema } from "../job/schemas/user-jobs-input.schema";
import { ApiGetCurrentUserContactsDocs } from "./decorators/api-get-current-user-contacts-docs.decorator";
import { ApiGetCurrentUserDocs } from "./decorators/api-get-current-user-docs.decorator";
import { ApiGetCurrentUserJobsDocs } from "./decorators/api-get-current-user-jobs-docs.decorator";
import { CurrentUserOutputSchema } from "./schemas/current-user-output.schema";
import { UserService } from "./user.service";

@ApiTags("users")
@Controller("users")
export class UserController {
	constructor(
		private readonly _userService: UserService,
		private readonly _contactService: ContactService,
		private readonly _jobService: JobService,
	) {}

	@Get("me/jobs")
	@Version("1")
	@Header("Cache-Control", "no-store")
	@AccessTokenRequired()
	@HttpCode(HttpStatus.OK)
	@ApiGetCurrentUserJobsDocs()
	async getUserJobs(
		@Query({ schema: UserJobsInputSchema }) query: z.infer<typeof UserJobsInputSchema>,
		@CurrentAuthSession() authSession: IAuthenticatedSession,
	): Promise<PaginatedResult<z.infer<typeof UserJobOutputSchema>>> {
		return this._jobService.getUserJobs({ posterUserId: authSession.userId, cursor: query.cursor });
	}

	@Get("me")
	@Version("1")
	@Header("Cache-Control", "no-store")
	@AccessTokenRequired()
	@HttpCode(HttpStatus.OK)
	@ApiGetCurrentUserDocs()
	async getCurrentUser(
		@CurrentAuthSession() authSession: IAuthenticatedSession,
	): Promise<z.infer<typeof CurrentUserOutputSchema>> {
		return this._userService.getCurrentUser({ sessionId: authSession.sessionId, userId: authSession.userId });
	}

	@Get("me/contacts")
	@Version("1")
	@Header("Cache-Control", "no-store")
	@AccessTokenRequired()
	@HttpCode(HttpStatus.OK)
	@ApiGetCurrentUserContactsDocs()
	async getContacts(
		@CurrentAuthSession() authSession: IAuthenticatedSession,
	): Promise<z.infer<typeof SavedContactsOutputSchema>> {
		return this._contactService.getContacts({ userId: authSession.userId });
	}
}
