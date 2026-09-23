import { Controller, Get, Header, HttpCode, HttpStatus, Param, Version } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { z } from "zod";
import { ContactService } from "./contact.service";
import { ApiGetContactDocs } from "./decorators/api-get-contact-docs.decorator";
import { ContactOutputSchema } from "./schemas/contact-output.schema";
import { GetContactInputSchema } from "./schemas/get-contact-input.schema";

@ApiTags("contacts")
@Controller("contacts")
export class ContactController {
	constructor(private readonly _contactService: ContactService) {}

	@Get(":contactId")
	@Version("1")
	@HttpCode(HttpStatus.OK)
	@Header("Cache-Control", "no-store")
	@ApiGetContactDocs()
	async getContact(
		@Param({ schema: GetContactInputSchema }) params: z.infer<typeof GetContactInputSchema>,
	): Promise<z.infer<typeof ContactOutputSchema>> {
		return this._contactService.getContact({ contactId: params.contactId });
	}
}
