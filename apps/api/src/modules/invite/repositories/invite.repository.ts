import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "../../../../generated/prisma/client";
import { PrismaService } from "../../../core/prisma/prisma.service";

@Injectable()
export class InviteRepository {
	constructor(@Inject(PrismaService) private readonly _prisma: Prisma.TransactionClient) {}

	async findAndLockByCode(params: {
		code: string;
	}): Promise<{ id: string; enabled: boolean; maxUses: number | null; uses: number } | null> {
		const codes = await this._prisma.$queryRaw<
			{ id: string }[]
		>`SELECT id FROM invites WHERE code = ${params.code} FOR UPDATE`;

		const code = codes[0];
		if (code === undefined) return null;

		const invite = await this._prisma.invite.findUniqueOrThrow({
			where: { id: code.id },
			select: { id: true, enabled: true, maxUses: true, _count: { select: { referredAccounts: true } } },
		});

		return {
			id: invite.id,
			enabled: invite.enabled,
			maxUses: invite.maxUses,
			uses: invite._count.referredAccounts,
		};
	}
}
