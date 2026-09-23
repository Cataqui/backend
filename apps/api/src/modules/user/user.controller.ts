import { Body, Controller, Get, Header, HttpCode, HttpStatus, Post, Version } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { z } from "zod";
import { AccessTokenRequired } from "../auth/decorators/access-token-required.decorator";
import { CurrentAuthSession } from "../auth/decorators/current-auth-session.decorator";
import type { IAuthenticatedSession } from "../auth/interfaces/authenticated-session.interface";
import { ApiAddContactDocs } from "./decorators/api-add-contact-docs.decorator";
import { ApiGetContactsDocs } from "./decorators/api-get-contacts-docs.decorator";
import { ApiGetCurrentUserDocs } from "./decorators/api-get-current-user-docs.decorator";
import { ContactInputSchema } from "./schemas/contact-input.schema";
import { CurrentUserOutputSchema } from "./schemas/current-user-output.schema";
import { SavedContactOutputSchema } from "./schemas/saved-contact-output.schema";
import { SavedContactsOutputSchema } from "./schemas/saved-contacts-output.schema";
import { UserService } from "./user.service";

@ApiTags("users")
@Controller("users")
export class UserController {
	constructor(private readonly _userService: UserService) {}

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
	@ApiGetContactsDocs()
	async getContacts(
		@CurrentAuthSession() authSession: IAuthenticatedSession,
	): Promise<z.infer<typeof SavedContactsOutputSchema>> {
		return this._userService.getContacts({ userId: authSession.userId });
	}

	@Post("me/contacts")
	@Version("1")
	@Header("Cache-Control", "no-store")
	@AccessTokenRequired()
	@HttpCode(HttpStatus.CREATED)
	@ApiAddContactDocs()
	async addContact(
		@Body({ schema: ContactInputSchema }) contact: z.infer<typeof ContactInputSchema>,
		@CurrentAuthSession() authSession: IAuthenticatedSession,
	): Promise<z.infer<typeof SavedContactOutputSchema>> {
		return this._userService.getOrAddContact({ userId: authSession.userId, contact: contact });
	}
}
