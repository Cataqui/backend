import { Injectable } from "@nestjs/common";
import type { ContactMethod, Prisma } from "../../../../generated/prisma/client.js";
import { PrismaService } from "../../../core/prisma/prisma.service";

@Injectable()
export class ContactRepository {
	constructor(private readonly _prisma: PrismaService) {}

	async findById(params: { contactId: string }): Promise<{ contactMethod: ContactMethod; identifier: string } | null> {
		return this._prisma.contact.findUnique({
			where: { id: params.contactId },
			select: { contactMethod: true, identifier: true },
		});
	}

	async upsertContact(params: {
		userId: string;
		contactMethod: ContactMethod;
		identifier: string;
	}): Promise<Prisma.ContactGetPayload<Record<string, never>>> {
		return this._prisma.contact.upsert({
			where: {
				userId_contactMethod_identifier: {
					userId: params.userId,
					contactMethod: params.contactMethod,
					identifier: params.identifier,
				},
			},
			update: {},
			create: {
				userId: params.userId,
				contactMethod: params.contactMethod,
				identifier: params.identifier,
			},
		});
	}

	async findContactsByUserId(params: { userId: string }): Promise<Prisma.ContactGetPayload<Record<string, never>>[]> {
		return this._prisma.contact.findMany({
			where: { userId: params.userId },
			orderBy: { createdAt: "desc" },
		});
	}
}
