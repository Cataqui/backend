import { Injectable } from "@nestjs/common";
import type { z } from "zod";
import { AccountAdmission } from "../../../generated/prisma/enums";
import { WaitlistRequiredError } from "./errors/waitlist-required.error";
import type { SkipWaitlistInputSchema } from "./schemas/skip-waitlist-input.schema";
import { WaitlistUnitOfWork } from "./waitlist.unit-of-work";

@Injectable()
export class WaitlistService {
	constructor(private readonly _unitOfWork: WaitlistUnitOfWork) {}

	async join(params: { accountId: string }): Promise<void> {
		await this._unitOfWork.execute(async ({ accountService }): Promise<void> => {
			const account = await accountService.get({ accountId: params.accountId });
			const hasNotRequestedAccess = account.admission === AccountAdmission.NOT_REQUESTED;

			if (!hasNotRequestedAccess) return;

			await accountService.updateAdmission({ accountId: account.id, admission: AccountAdmission.WAITLISTED });
		});
	}

	async skip(params: { accountId: string; input: z.infer<typeof SkipWaitlistInputSchema> }): Promise<void> {
		await this._unitOfWork.execute(async ({ accountService, inviteService }): Promise<void> => {
			const account = await accountService.get({ accountId: params.accountId });

			const isAdmitted = account.admission === AccountAdmission.ADMITTED;
			if (isAdmitted) return;

			const isWaitlisted = account.admission === AccountAdmission.WAITLISTED;
			if (!isWaitlisted) throw new WaitlistRequiredError();

			const invite = await inviteService.lockAvailableByCode({ code: params.input.inviteCode });

			await accountService.setFromInvite({ accountId: account.id, inviteId: invite.id });
			await accountService.updateAdmission({
				accountId: account.id,
				admission: AccountAdmission.ADMITTED,
			});
		});
	}
}
