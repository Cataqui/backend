import { Body, Controller, Get, Header, HttpCode, HttpStatus, Post, Version } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { z } from "zod";
import { ProductAnalyticsEvent } from "../../core/observability/product-analytics-event.decorator";
import { ProductAnalyticsEventName } from "../../core/observability/product-analytics-event-name.enum";
import { AccessTokenRequired } from "../auth/decorators/access-token-required.decorator";
import { CurrentAuthSession } from "../auth/decorators/current-auth-session.decorator";
import type { IAuthenticatedSession } from "../auth/interfaces/authenticated-session.interface";
import { ApiAddContactDocs } from "./decorators/api-add-contact-docs.decorator";
import { ApiGetContactsDocs } from "./decorators/api-get-contacts-docs.decorator";
import { ContactInputSchema } from "./schemas/contact-input.schema";
import { SavedContactOutputSchema } from "./schemas/saved-contact-output.schema";
import { SavedContactsOutputSchema } from "./schemas/saved-contacts-output.schema";
import { UserService } from "./user.service";

@ApiTags("users")
@Controller("users")
export class UserController {
	constructor(private readonly _userService: UserService) {}

	@Get("me/contacts")
	@Version("1")
	@Header("Cache-Control", "no-store")
	@AccessTokenRequired()
	@HttpCode(HttpStatus.OK)
	@ProductAnalyticsEvent({ eventName: ProductAnalyticsEventName.SAVED_CONTACTS_READ_REQUEST_SUCCEEDED })
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
	@ProductAnalyticsEvent({ eventName: ProductAnalyticsEventName.SAVED_CONTACT_CREATE_REQUEST_SUCCEEDED })
	@ApiAddContactDocs()
	async addContact(
		@Body({ schema: ContactInputSchema }) contact: z.infer<typeof ContactInputSchema>,
		@CurrentAuthSession() authSession: IAuthenticatedSession,
	): Promise<z.infer<typeof SavedContactOutputSchema>> {
		return this._userService.getOrAddContact({ userId: authSession.userId, contact: contact });
	}
}
