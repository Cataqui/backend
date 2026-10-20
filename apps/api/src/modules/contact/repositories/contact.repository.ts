import { Injectable } from "@nestjs/common";
import type { ContactMethod, Prisma } from "../../../../generated/prisma/client";
import { PrismaService } from "../../../core/prisma/prisma.service";

@Injectable()
export class ContactRepository {
	constructor(private readonly _prisma: PrismaService) {}

	async upsertContact(params: {
		ownerProfileId: string;
		contactMethod: ContactMethod;
		identifier: string;
	}): Promise<Prisma.ContactGetPayload<Record<string, never>>> {
		return this._prisma.contact.upsert({
			where: {
				ownerProfileId_contactMethod_identifier: {
					ownerProfileId: params.ownerProfileId,
					contactMethod: params.contactMethod,
					identifier: params.identifier,
				},
			},
			update: {},
			create: {
				ownerProfileId: params.ownerProfileId,
				contactMethod: params.contactMethod,
				identifier: params.identifier,
			},
		});
	}

	async findContactsByOwnerProfileId(params: {
		ownerProfileId: string;
	}): Promise<Prisma.ContactGetPayload<Record<string, never>>[]> {
		return this._prisma.contact.findMany({
			where: { ownerProfileId: params.ownerProfileId },
			orderBy: { createdAt: "desc" },
		});
	}
}
