import type { AuthenticatedSession } from "@cataqui/auth-schemas";
import { Body, Controller, Header, HttpCode, HttpStatus, Post, Version } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { z } from "zod";
import { CurrentAuthSession } from "../authentication/decorators/current-auth-session.decorator";
import { ApiJoinWaitlistDocs } from "./decorators/api-join-waitlist-docs.decorator";
import { ApiSkipWaitlistDocs } from "./decorators/api-skip-waitlist-docs.decorator";
import { SkipWaitlistInputSchema } from "./schemas/skip-waitlist-input.schema";
import { WaitlistService } from "./waitlist.service";

@ApiTags("waitlist")
@Controller("waitlist")
export class WaitlistController {
	constructor(private readonly _waitlistService: WaitlistService) {}

	@Post("join")
	@Version("1")
	@Header("Cache-Control", "no-store")
	@HttpCode(HttpStatus.NO_CONTENT)
	@ApiJoinWaitlistDocs()
	async join(@CurrentAuthSession() authSession: AuthenticatedSession): Promise<void> {
		await this._waitlistService.join({ accountId: authSession.accountId });
	}

	@Post("skip")
	@Version("1")
	@Header("Cache-Control", "no-store")
	@HttpCode(HttpStatus.NO_CONTENT)
	@ApiSkipWaitlistDocs()
	async skip(
		@CurrentAuthSession() authSession: AuthenticatedSession,
		@Body({ schema: SkipWaitlistInputSchema }) input: z.infer<typeof SkipWaitlistInputSchema>,
	): Promise<void> {
		await this._waitlistService.skip({ accountId: authSession.accountId, input: input });
	}
}
