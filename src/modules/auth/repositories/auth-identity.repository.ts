import { Injectable } from "@nestjs/common";
import { AuthIdentityProvider, Prisma } from "../../../../generated/prisma/client.js";
import { PrismaService } from "../../../core/prisma/prisma.service";

@Injectable()
export class AuthIdentityRepository {
	constructor(private readonly _prisma: PrismaService) {}

	async upsertIdentity(params: {
		provider: AuthIdentityProvider;
		providerSubject: string;
		lastVerifiedAt: Date;
	}): Promise<string> {
		try {
			const identity = await this._prisma.authIdentity.upsert({
				where: {
					provider_providerSubject: {
						provider: params.provider,
						providerSubject: params.providerSubject,
					},
				},
				update: {
					lastVerifiedAt: params.lastVerifiedAt,
				},
				create: {
					provider: params.provider,
					providerSubject: params.providerSubject,
					lastVerifiedAt: params.lastVerifiedAt,
					user: { create: {} },
				},
				select: { userId: true },
			});

			return identity.userId;
		} catch (error) {
			if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;

			const identity = await this._prisma.authIdentity.update({
				where: {
					provider_providerSubject: {
						provider: params.provider,
						providerSubject: params.providerSubject,
					},
				},
				data: {
					lastVerifiedAt: params.lastVerifiedAt,
				},
				select: { userId: true },
			});

			return identity.userId;
		}
	}
}
