import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { z } from "zod";
import { ProfileCreationConflictError } from "./errors/profile-creation-conflict.error";
import { ProfileNotFoundError } from "./errors/profile-not-found.error";
import { ProfileRequiredError } from "./errors/profile-required.error";
import { ProfileRepository } from "./repositories/profile.repository";
import type { CreateProfileInputSchema } from "./schemas/create-profile-input.schema";
import type { ProfileOutputSchema } from "./schemas/profile-output.schema";

@Injectable()
export class ProfileService {
	constructor(private readonly _repository: ProfileRepository) {}

	async create(params: {
		profileId: string;
		input: z.infer<typeof CreateProfileInputSchema>;
	}): Promise<{ created: boolean; profile: z.infer<typeof ProfileOutputSchema> }> {
		const contacts = [
			...new Map(
				params.input.initialContacts.map((contact) => [
					JSON.stringify({ method: contact.method, identifier: contact.identifier }),
					{ method: contact.method, identifier: contact.identifier },
				]),
			).entries(),
		]
			.sort(([leftKey], [rightKey]) => (leftKey < rightKey ? -1 : 1))
			.map(([, contact]) => contact);

		const creationHash = createHash("sha256")
			.update(JSON.stringify({ name: params.input.name, contacts: contacts }))
			.digest("hex");

		const result = await this._repository.createWithContacts({
			profileId: params.profileId,
			name: params.input.name,
			creationHash: creationHash,
			contacts: contacts,
		});

		const sameCreation = result.profile.creationHash === creationHash;
		if (!sameCreation) throw new ProfileCreationConflictError();

		return {
			created: result.insertion.count === 1,
			profile: { profileId: result.profile.id, name: result.profile.name },
		};
	}

	async getCurrent(params: { profileId: string }): Promise<z.infer<typeof ProfileOutputSchema>> {
		const profile = await this._repository.findById({ profileId: params.profileId });
		if (profile === null) throw new ProfileNotFoundError();
		return { profileId: profile.id, name: profile.name };
	}

	async requireExists(params: { profileId: string }): Promise<void> {
		const profile = await this._repository.findById({ profileId: params.profileId });
		if (profile === null) throw new ProfileRequiredError();
	}
}
