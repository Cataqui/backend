import { randomUUID } from "node:crypto";
import { injectable } from "tsyringe";
import { Prisma, PrismaClient } from "../generated/prisma/client";

@injectable()
export class AccountRepository {
	constructor(private readonly _prisma: PrismaClient) {}

	async saveVerifiedIdentity(params: {
		providerSubject: string;
		displayIdentifier: string;
		identifier: string;
		lastVerifiedAt: Date;
	}): Promise<{ accountId: string; identityId: string } | undefined> {
		const rows = await this._prisma.$queryRaw<{ accountId: string; identityId: string }[]>(Prisma.sql`
   SELECT "accountId", "identityId" FROM "public"."save_verified_identity"(
    ${params.providerSubject}::text, ${params.displayIdentifier}::text, ${params.identifier}::text,
    ${params.lastVerifiedAt}::timestamp(3), ${randomUUID()}::uuid, ${randomUUID()}::uuid
   )
  `);
		return rows[0];
	}

	async findById(params: {
		accountId: string;
	}): Promise<Prisma.AccountGetPayload<{ include: { identities: true } }> | null> {
		return this._prisma.account.findUnique({ where: { id: params.accountId }, include: { identities: true } });
	}
}
