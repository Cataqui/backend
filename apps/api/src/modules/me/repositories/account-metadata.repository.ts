import { Injectable } from "@nestjs/common";
import type { AccountMetadata } from "../../../../generated/prisma/client";
import { PrismaService } from "../../../core/prisma/prisma.service";

@Injectable()
export class AccountMetadataRepository {
	constructor(private readonly _prisma: PrismaService) {}

	async findByAccountId(params: { accountId: string }): Promise<AccountMetadata | null> {
		return this._prisma.accountMetadata.findUnique({ where: { accountId: params.accountId } });
	}

	async upsert(params: { accountId: string; onboardingCompleted: boolean }): Promise<AccountMetadata> {
		return this._prisma.accountMetadata.upsert({
			where: { accountId: params.accountId },
			create: { accountId: params.accountId, onboardingCompleted: params.onboardingCompleted },
			update: { onboardingCompleted: params.onboardingCompleted },
		});
	}
}
