import { Injectable } from "@nestjs/common";
import type { z } from "zod";
import { ContactRepository } from "./repositories/contact.repository";
import type { ContactInputSchema } from "./schemas/contact-input.schema";
import type { SavedContactOutputSchema } from "./schemas/saved-contact-output.schema";
import type { SavedContactsOutputSchema } from "./schemas/saved-contacts-output.schema";

@Injectable()
export class ContactService {
	constructor(private readonly _contactRepository: ContactRepository) {}

	async getOrAddContact(params: {
		userId: string;
		contact: z.infer<typeof ContactInputSchema>;
	}): Promise<z.infer<typeof SavedContactOutputSchema>> {
		const contact = await this._contactRepository.upsertContact({
			userId: params.userId,
			contactMethod: params.contact.method,
			identifier: params.contact.identifier,
		});
		return { contactId: contact.id, method: contact.contactMethod, identifier: contact.identifier };
	}

	async getContacts(params: { userId: string }): Promise<z.infer<typeof SavedContactsOutputSchema>> {
		const contacts = await this._contactRepository.findContactsByUserId({ userId: params.userId });
		return contacts.map((contact) => ({
			contactId: contact.id,
			method: contact.contactMethod,
			identifier: contact.identifier,
		}));
	}
}
