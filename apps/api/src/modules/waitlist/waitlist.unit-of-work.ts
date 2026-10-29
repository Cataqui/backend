import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { AccountService } from "../account/account.service";
import { AccountRepository } from "../account/repositories/account.repository";
import { InviteService } from "../invite/invite.service";
import { InviteRepository } from "../invite/repositories/invite.repository";

@Injectable()
export class WaitlistUnitOfWork {
	constructor(private readonly _prisma: PrismaService) {}

	execute<Result>(
		operation: (services: { accountService: AccountService; inviteService: InviteService }) => Promise<Result>,
	): Promise<Result> {
		return this._prisma.$transaction(async (transaction) =>
			operation({
				accountService: new AccountService(new AccountRepository(transaction)),
				inviteService: new InviteService(new InviteRepository(transaction)),
			}),
		);
	}
}
