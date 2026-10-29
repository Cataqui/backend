import { Injectable } from "@nestjs/common";
import type { Account, AccountAdmission } from "../../../generated/prisma/client";
import { AccountInviteAlreadySetError } from "./errors/account-invite-already-set.error";
import { AccountRepository } from "./repositories/account.repository";

@Injectable()
export class AccountService {
	constructor(private readonly _repository: AccountRepository) {}

	async get(params: { accountId: string }): Promise<Account> {
		return this._repository.getOrCreate({ accountId: params.accountId });
	}

	async completeOnboarding(params: { accountId: string }): Promise<void> {
		await this._repository.completeOnboarding({ accountId: params.accountId });
	}

	async updateAdmission(params: { accountId: string; admission: AccountAdmission }): Promise<void> {
		await this._repository.updateAdmission({ accountId: params.accountId, admission: params.admission });
	}

	async setFromInvite(params: { accountId: string; inviteId: string }): Promise<void> {
		const assigned = await this._repository.setFromInviteIfEmpty({
			accountId: params.accountId,
			inviteId: params.inviteId,
		});

		if (!assigned) throw new AccountInviteAlreadySetError();
	}
}
