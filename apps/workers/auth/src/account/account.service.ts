import { injectable } from "tsyringe";
import type { z } from "zod";
import type { AccountOutputSchema } from "./account-output.schema";
import { AccountRepository } from "./account.repository";
import { AccountNotFoundError } from "./errors/account-not-found.error";

@injectable()
export class AccountService {
	constructor(private readonly _repository: AccountRepository) {}
	async getCurrent(params: { accountId: string }): Promise<z.infer<typeof AccountOutputSchema>> {
		const account = await this._repository.findById({ accountId: params.accountId });

		if (account === null) throw new AccountNotFoundError();

		return {
			accountId: account.id,
			identities: account.identities.map((identity) => ({
				identityId: identity.id,
				provider: identity.provider,
				identifier: identity.identifier,
				displayIdentifier: identity.displayIdentifier,
				lastVerifiedAt: identity.lastVerifiedAt.toISOString(),
			})),
		};
	}
}
