import { Injectable } from "@nestjs/common";
import type { Account } from "../../../generated/prisma/client";
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
}
