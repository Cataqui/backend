import { Injectable } from "@nestjs/common";
import type { z } from "zod";
import { UserRepository } from "./repositories/user.repository";
import type { ContactInputSchema } from "./schemas/contact-input.schema";
import type { CurrentUserOutputSchema } from "./schemas/current-user-output.schema";
import type { SavedContactOutputSchema } from "./schemas/saved-contact-output.schema";
import type { SavedContactsOutputSchema } from "./schemas/saved-contacts-output.schema";

@Injectable()
export class UserService {
	constructor(private readonly _userRepository: UserRepository) {}

	async getCurrentUser(params: {
		sessionId: string;
		userId: string;
	}): Promise<z.infer<typeof CurrentUserOutputSchema>> {
		return this._userRepository.findCurrentUserForSession({
			sessionId: params.sessionId,
			userId: params.userId,
		});
	}

	async getOrAddContact(params: {
		userId: string;
		contact: z.infer<typeof ContactInputSchema>;
	}): Promise<z.infer<typeof SavedContactOutputSchema>> {
		const contact = await this._userRepository.upsertContact({
			userId: params.userId,
			contactMethod: params.contact.contactMethod,
			identifier: params.contact.identifier,
		});

		return {
			contactId: contact.id,
			contactMethod: contact.contactMethod,
			identifier: contact.identifier,
		};
	}

	async getContacts(params: { userId: string }): Promise<z.infer<typeof SavedContactsOutputSchema>> {
		const contacts = await this._userRepository.findContactsByUserId({ userId: params.userId });

		return contacts.map((contact) => ({
			contactId: contact.id,
			contactMethod: contact.contactMethod,
			identifier: contact.identifier,
		}));
	}
}
