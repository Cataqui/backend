import { Inject, Injectable } from "@nestjs/common";
import type { Account, AccountAdmission, Prisma } from "../../../../generated/prisma/client";
import { PrismaService } from "../../../core/prisma/prisma.service";

@Injectable()
export class AccountRepository {
	constructor(@Inject(PrismaService) private readonly _prisma: Prisma.TransactionClient) {}

	async updateAdmission(params: { accountId: string; admission: AccountAdmission }): Promise<void> {
		await this._prisma.account.update({
			where: { id: params.accountId },
			data: { admission: params.admission },
		});
	}

	async setFromInviteIfEmpty(params: { accountId: string; inviteId: string }): Promise<boolean> {
		const assignment = await this._prisma.account.updateMany({
			where: { id: params.accountId, fromInviteId: null },
			data: { fromInviteId: params.inviteId },
		});

		return assignment.count === 1;
	}

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
