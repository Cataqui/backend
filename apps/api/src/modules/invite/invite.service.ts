import { Injectable } from "@nestjs/common";
import { InviteUnavailableError } from "./errors/invite-unavailable.error";
import { InviteRepository } from "./repositories/invite.repository";

@Injectable()
export class InviteService {
	constructor(private readonly _repository: InviteRepository) {}

	async lockAvailableByCode(params: { code: string }): Promise<{ id: string }> {
		const invite = await this._repository.findAndLockByCode({ code: params.code });
		if (invite === null) throw new InviteUnavailableError();

		const hasCapacity = invite.maxUses === null || invite.uses < invite.maxUses;
		if (!invite.enabled || !hasCapacity) throw new InviteUnavailableError();

		return { id: invite.id };
	}
}
