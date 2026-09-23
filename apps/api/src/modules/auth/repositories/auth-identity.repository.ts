import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { type AuthIdentityProvider, type JobContactMethod, Prisma } from "../../../../generated/prisma/client.js";
import { PrismaService } from "../../../core/prisma/prisma.service";

@Injectable()
export class AuthIdentityRepository {
	constructor(private readonly _prisma: PrismaService) {}

	async saveVerifiedIdentityAndContact(params: {
		provider: AuthIdentityProvider;
		providerSubject: string;
		displayIdentifier: string;
		lastVerifiedAt: Date;
		contactMethod: JobContactMethod;
		contactIdentifier: string;
	}): Promise<{ userId: string; authIdentityId: string }> {
		const [verifiedIdentity] = await this._prisma.$queryRaw<{ userId: string; authIdentityId: string }[]>(Prisma.sql`
			SELECT "userId", "authIdentityId" FROM "public"."save_verified_identity_and_contact"(
				${params.provider}::"public"."AuthIdentityProvider",
				${params.providerSubject}::text,
				${params.displayIdentifier}::text,
				${params.lastVerifiedAt}::timestamp(3),
				${params.contactMethod}::"public"."JobContactMethod",
				${params.contactIdentifier}::text,
				${randomUUID()}::uuid,
				${randomUUID()}::uuid,
				${randomUUID()}::uuid
			) AS "userId"
		`);

		if (verifiedIdentity === undefined) {
			throw new Error("Verified identity and contact persistence returned no user");
		}

		return verifiedIdentity;
	}
}
