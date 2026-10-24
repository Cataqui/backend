import type { AuthenticatedSession } from "@cataqui/auth-schemas";
import { Body, Controller, Get, Header, HttpCode, HttpStatus, Patch, Version } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { z } from "zod";
import { CurrentAuthSession } from "../authentication/decorators/current-auth-session.decorator";
import { AccountMetadataService } from "./account-metadata.service";
import { ApiGetMeMetadataDocs } from "./decorators/api-get-me-metadata-docs.decorator";
import { ApiUpdateMeMetadataDocs } from "./decorators/api-update-me-metadata-docs.decorator";
import type { AccountMetadataOutputSchema } from "./schemas/account-metadata-output.schema";
import { UpdateAccountMetadataInputSchema } from "./schemas/update-account-metadata-input.schema";

@ApiTags("me")
@Controller("me")
export class MeController {
	constructor(private readonly _accountMetadataService: AccountMetadataService) {}

	@Get("metadata")
	@Version("1")
	@Header("Cache-Control", "no-store")
	@HttpCode(HttpStatus.OK)
	@ApiGetMeMetadataDocs()
	async getMetadata(
		@CurrentAuthSession() authSession: AuthenticatedSession,
	): Promise<z.infer<typeof AccountMetadataOutputSchema>> {
		return this._accountMetadataService.get({ accountId: authSession.accountId });
	}

	@Patch("metadata")
	@Version("1")
	@Header("Cache-Control", "no-store")
	@HttpCode(HttpStatus.OK)
	@ApiUpdateMeMetadataDocs()
	async updateMetadata(
		@CurrentAuthSession() authSession: AuthenticatedSession,
		@Body({ schema: UpdateAccountMetadataInputSchema }) input: z.infer<typeof UpdateAccountMetadataInputSchema>,
	): Promise<z.infer<typeof AccountMetadataOutputSchema>> {
		return this._accountMetadataService.update({ accountId: authSession.accountId, input: input });
	}
}
