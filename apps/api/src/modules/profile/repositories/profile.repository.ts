import { Injectable } from "@nestjs/common";
import type { ContactMethod, Prisma, Profile } from "../../../../generated/prisma/client";
import { PrismaService } from "../../../core/prisma/prisma.service";

@Injectable()
export class ProfileRepository {
	constructor(private readonly _prisma: PrismaService) {}

	async findById(params: { profileId: string }): Promise<Profile | null> {
		return this._prisma.profile.findUnique({ where: { id: params.profileId } });
	}

	async createWithContacts(params: {
		profileId: string;
		name: string;
		creationHash: string;
		contacts: { method: ContactMethod; identifier: string }[];
	}): Promise<{ insertion: Prisma.BatchPayload; profile: Profile }> {
		return this._prisma.$transaction(async (transaction) => {
			const insertion = await transaction.profile.createMany({
				data: [{ id: params.profileId, name: params.name, creationHash: params.creationHash }],
				skipDuplicates: true,
			});
			const profileCreated = insertion.count === 1;
			if (profileCreated && params.contacts.length > 0) {
				await transaction.contact.createMany({
					data: params.contacts.map((contact) => ({
						ownerProfileId: params.profileId,
						contactMethod: contact.method,
						identifier: contact.identifier,
					})),
					skipDuplicates: true,
				});
			}
			const profile = await transaction.profile.findUniqueOrThrow({ where: { id: params.profileId } });
			return { insertion: insertion, profile: profile };
		});
	}
}
