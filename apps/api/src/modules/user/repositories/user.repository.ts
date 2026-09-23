import { Injectable } from "@nestjs/common";
import type { JobContactMethod, Prisma } from "../../../../generated/prisma/client.js";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { AuthSessionUnavailableError } from "../../auth/errors/auth-session-unavailable.error";

@Injectable()
export class UserRepository {
	constructor(private readonly _prisma: PrismaService) {}

	async findCurrentUserForSession(params: {
		sessionId: string;
		userId: string;
	}): Promise<{ userId: string; displayIdentifier: string }> {
		const session = await this._prisma.authSession.findFirst({
			where: { id: params.sessionId, userId: params.userId },
			select: { userId: true, authIdentity: { select: { displayIdentifier: true } } },
		});
		if (session?.authIdentity === null || session === null) throw new AuthSessionUnavailableError();
		return { userId: session.userId, displayIdentifier: session.authIdentity.displayIdentifier };
	}

	async upsertContact(params: {
		userId: string;
		contactMethod: JobContactMethod;
		identifier: string;
	}): Promise<Prisma.JobContactGetPayload<Record<string, never>>> {
		return this._prisma.jobContact.upsert({
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

	async findContactsByUserId(params: {
		userId: string;
	}): Promise<Prisma.JobContactGetPayload<Record<string, never>>[]> {
		return this._prisma.jobContact.findMany({
			where: { userId: params.userId },
			orderBy: { createdAt: "desc" },
		});
	}
}
