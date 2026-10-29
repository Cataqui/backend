import type { AuthenticatedSession } from "@cataqui/auth-schemas";
import { Controller, Get, Header, HttpCode, HttpStatus, Post, Version } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { z } from "zod";
import { CurrentAuthSession } from "../authentication/decorators/current-auth-session.decorator";
import { AccountService } from "./account.service";
import { ApiGetAccountDocs } from "./decorators/api-get-account-docs.decorator";
import { ApiCompleteOnboardingDocs } from "./decorators/api-complete-onboarding-docs.decorator";
import type { AccountOutputSchema } from "./schemas/account-output.schema";

@ApiTags("account")
@Controller("account")
export class AccountController {
	constructor(private readonly _accountService: AccountService) {}

	@Get()
	@Version("1")
	@Header("Cache-Control", "no-store")
	@HttpCode(HttpStatus.OK)
	@ApiGetAccountDocs()
	async getAccount(
		@CurrentAuthSession() authSession: AuthenticatedSession,
	): Promise<z.infer<typeof AccountOutputSchema>> {
		const account = await this._accountService.get({ accountId: authSession.accountId });
		return { id: account.id, admission: account.admission, onboardingCompleted: account.onboardingCompleted };
	}

	@Post("complete-onboarding")
	@Version("1")
	@Header("Cache-Control", "no-store")
	@HttpCode(HttpStatus.NO_CONTENT)
	@ApiCompleteOnboardingDocs()
	async completeOnboarding(@CurrentAuthSession() authSession: AuthenticatedSession): Promise<void> {
		await this._accountService.completeOnboarding({ accountId: authSession.accountId });
	}
}
