import { Injectable } from "@nestjs/common";
import type { z } from "zod";
import { AccountMetadataRepository } from "./repositories/account-metadata.repository";
import type { AccountMetadataOutputSchema } from "./schemas/account-metadata-output.schema";
import type { UpdateAccountMetadataInputSchema } from "./schemas/update-account-metadata-input.schema";

@Injectable()
export class AccountMetadataService {
	constructor(private readonly _repository: AccountMetadataRepository) {}

	async get(params: { accountId: string }): Promise<z.infer<typeof AccountMetadataOutputSchema>> {
		const metadata = await this._repository.findByAccountId({ accountId: params.accountId });
		return { onboardingCompleted: metadata?.onboardingCompleted ?? false };
	}

	async update(params: {
		accountId: string;
		input: z.infer<typeof UpdateAccountMetadataInputSchema>;
	}): Promise<z.infer<typeof AccountMetadataOutputSchema>> {
		if (params.input.onboardingCompleted === undefined) return this.get({ accountId: params.accountId });

		const metadata = await this._repository.upsert({
			accountId: params.accountId,
			onboardingCompleted: params.input.onboardingCompleted,
		});

		return { onboardingCompleted: metadata.onboardingCompleted };
	}
}
