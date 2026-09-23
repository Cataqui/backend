import { Injectable } from "@nestjs/common";
import type { z } from "zod";
import { ContactNotFoundError } from "./errors/contact-not-found.error";
import { ContactRepository } from "./repositories/contact.repository";
import type { ContactInputSchema } from "./schemas/contact-input.schema";
import type { ContactOutputSchema } from "./schemas/contact-output.schema";
import type { SavedContactOutputSchema } from "./schemas/saved-contact-output.schema";
import type { SavedContactsOutputSchema } from "./schemas/saved-contacts-output.schema";

@Injectable()
export class ContactService {
	constructor(private readonly _contactRepository: ContactRepository) {}

	async getContact(params: { contactId: string }): Promise<z.infer<typeof ContactOutputSchema>> {
		const contact = await this._contactRepository.findById({ contactId: params.contactId });
		if (contact === null) throw new ContactNotFoundError();
		return { contactMethod: contact.contactMethod, identifier: contact.identifier };
	}

	async getOrAddContact(params: {
		userId: string;
		contact: z.infer<typeof ContactInputSchema>;
	}): Promise<z.infer<typeof SavedContactOutputSchema>> {
		const contact = await this._contactRepository.upsertContact({
			userId: params.userId,
			contactMethod: params.contact.contactMethod,
			identifier: params.contact.identifier,
		});
		return { contactId: contact.id, contactMethod: contact.contactMethod, identifier: contact.identifier };
	}

	async getContacts(params: { userId: string }): Promise<z.infer<typeof SavedContactsOutputSchema>> {
		const contacts = await this._contactRepository.findContactsByUserId({ userId: params.userId });
		return contacts.map((contact) => ({
			contactId: contact.id,
			contactMethod: contact.contactMethod,
			identifier: contact.identifier,
		}));
	}
}
