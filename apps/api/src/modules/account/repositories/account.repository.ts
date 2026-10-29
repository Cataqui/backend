import { Injectable } from "@nestjs/common";
import type { Account } from "../../../../generated/prisma/client";
import { PrismaService } from "../../../core/prisma/prisma.service";

@Injectable()
export class AccountRepository {
	constructor(private readonly _prisma: PrismaService) {}

	async getOrCreate(params: { accountId: string }): Promise<Account> {
		return this._prisma.account.upsert({
			where: { id: params.accountId },
			create: { id: params.accountId },
			update: { id: params.accountId },
		});
	}

	async completeOnboarding(params: { accountId: string }): Promise<void> {
		await this._prisma.account.upsert({
			where: { id: params.accountId },
			create: { id: params.accountId, onboardingCompleted: true },
			update: { onboardingCompleted: true },
			select: { id: true },
		});
	}
}
