import * as td from "testdouble";
import { AccountAdmission, type Prisma } from "../../../generated/prisma/client";
import type { PrismaService } from "../../core/prisma/prisma.service";
import { AccountService } from "../account/account.service";
import { AccountRepository } from "../account/repositories/account.repository";
import { InviteService } from "../invite/invite.service";
import { InviteRepository } from "../invite/repositories/invite.repository";
import { WaitlistUnitOfWork } from "./waitlist.unit-of-work";

afterEach(() => td.reset());

describe("WaitlistUnitOfWork", () => {
	it("creates isolated services on the supplied transaction without rebinding ordinary services", async () => {
		const prisma = td.object<PrismaService>();
		Object.defineProperty(prisma, "account", { value: td.object<PrismaService["account"]>() });
		Object.defineProperty(prisma, "invite", { value: td.object<PrismaService["invite"]>() });
		const transaction = td.object<Prisma.TransactionClient>();
		Object.defineProperty(transaction, "account", { value: td.object<Prisma.TransactionClient["account"]>() });
		Object.defineProperty(transaction, "invite", { value: td.object<Prisma.TransactionClient["invite"]>() });
		td.when(
			transaction.invite.findUniqueOrThrow({
				where: { id: "scoped" },
				select: { id: true, enabled: true, maxUses: true, _count: { select: { referredAccounts: true } } },
			}),
		).thenResolve({
			id: "scoped",
			enabled: true,
			maxUses: null,
			_count: { referredAccounts: 0 },
		});
		td.when(transaction.$queryRaw(td.matchers.anything(), td.matchers.anything())).thenResolve([{ id: "scoped" }]);
		td.when(
			prisma.invite.findUniqueOrThrow({
				where: { id: "ordinary" },
				select: { id: true, enabled: true, maxUses: true, _count: { select: { referredAccounts: true } } },
			}),
		).thenResolve({
			id: "ordinary",
			enabled: true,
			maxUses: null,
			_count: { referredAccounts: 0 },
		});
		td.when(prisma.$queryRaw(td.matchers.anything(), td.matchers.anything())).thenResolve([{ id: "ordinary" }]);
		td.when(transaction.account.updateMany(td.matchers.anything())).thenResolve({ count: 1 });
		td.when(prisma.$transaction(td.matchers.anything())).thenDo(
			async (operation: (client: Prisma.TransactionClient) => Promise<unknown>): Promise<unknown> =>
				operation(transaction),
		);
		const ordinaryService = new AccountService(new AccountRepository(prisma));
		const ordinaryInviteService = new InviteService(new InviteRepository(prisma));
		const unitOfWork = new WaitlistUnitOfWork(prisma);
		const scopes: AccountService[] = [];
		const inviteScopes: InviteService[] = [];
		await unitOfWork.execute(async ({ accountService, inviteService }): Promise<void> => {
			scopes.push(accountService);
			inviteScopes.push(inviteService);
			await inviteService.lockAvailableByCode({ code: "first" });
			await accountService.updateAdmission({ accountId: "first", admission: AccountAdmission.WAITLISTED });
		});
		await unitOfWork.execute(async ({ accountService, inviteService }): Promise<void> => {
			scopes.push(accountService);
			inviteScopes.push(inviteService);
			await inviteService.lockAvailableByCode({ code: "second" });
			await accountService.setFromInvite({ accountId: "second", inviteId: "invite" });
			await accountService.updateAdmission({
				accountId: "second",
				admission: AccountAdmission.ADMITTED,
			});
		});
		await ordinaryService.updateAdmission({ accountId: "ordinary", admission: AccountAdmission.WAITLISTED });
		const ordinaryInvite = await ordinaryInviteService.lockAvailableByCode({ code: "ordinary" });
		expect({
			distinct: scopes[0] !== scopes[1],
			distinctInviteServices: inviteScopes[0] !== inviteScopes[1],
			ordinaryInvite: ordinaryInvite,
			scopedInviteReads: td.explain(transaction.invite.findUniqueOrThrow).callCount,
			transactions: td.explain(prisma.$transaction).callCount,
			scopedWrites: td.explain(transaction.account.update).calls.map((call) => call.args),
			attributionWrites: td.explain(transaction.account.updateMany).calls.map((call) => call.args),
			ordinaryWrites: td.explain(prisma.account.update).calls.map((call) => call.args),
		}).toEqual({
			distinct: true,
			distinctInviteServices: true,
			ordinaryInvite: { id: "ordinary" },
			scopedInviteReads: 2,
			transactions: 2,
			scopedWrites: [
				[{ where: { id: "first" }, data: { admission: AccountAdmission.WAITLISTED } }],
				[{ where: { id: "second" }, data: { admission: AccountAdmission.ADMITTED } }],
			],
			attributionWrites: [[{ where: { id: "second", fromInviteId: null }, data: { fromInviteId: "invite" } }]],
			ordinaryWrites: [[{ where: { id: "ordinary" }, data: { admission: AccountAdmission.WAITLISTED } }]],
		});
	});
	it("returns the operation result only after the transaction finishes", async () => {
		const prisma = td.object<PrismaService>();
		const transaction = td.object<Prisma.TransactionClient>();
		const sequence: string[] = [];
		td.when(prisma.$transaction(td.matchers.anything())).thenDo(
			async (operation: (client: Prisma.TransactionClient) => Promise<unknown>): Promise<unknown> => {
				const result = await operation(transaction);
				sequence.push("committed");
				return result;
			},
		);
		const result = await new WaitlistUnitOfWork(prisma).execute(async (): Promise<string> => {
			sequence.push("operation");
			return "result";
		});
		expect({ result: result, sequence: sequence }).toEqual({ result: "result", sequence: ["operation", "committed"] });
	});
	it("propagates operation failures to the database transaction owner", async () => {
		const prisma = td.object<PrismaService>();
		const transaction = td.object<Prisma.TransactionClient>();
		const failure = new Error("operation failed");
		td.when(prisma.$transaction(td.matchers.anything())).thenDo(
			async (operation: (client: Prisma.TransactionClient) => Promise<unknown>): Promise<unknown> =>
				operation(transaction),
		);
		await expect(
			new WaitlistUnitOfWork(prisma).execute(async (): Promise<never> => {
				throw failure;
			}),
		).rejects.toBe(failure);
	});
});
