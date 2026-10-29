import * as td from "testdouble";
import type { Prisma } from "../../../../generated/prisma/client";
import { InviteRepository } from "./invite.repository";

afterEach(() => td.reset());

describe("InviteRepository", () => {
	it("returns absence without counting usage when the code cannot be locked", async () => {
		const transaction = td.object<Prisma.TransactionClient>();
		Object.defineProperty(transaction, "invite", { value: td.object<Prisma.TransactionClient["invite"]>() });
		td.when(transaction.$queryRaw(td.matchers.anything(), "CODE")).thenResolve([]);
		const repository = new InviteRepository(transaction);
		const result = await repository.findAndLockByCode({ code: "CODE" });
		expect({ result: result, reads: td.explain(transaction.invite.findUniqueOrThrow).callCount }).toEqual({
			result: null,
			reads: 0,
		});
	});

	it("locks the code before reading account usage and returns only availability data", async () => {
		const sequence: string[] = [];
		const transaction = td.object<Prisma.TransactionClient>();
		Object.defineProperty(transaction, "invite", { value: td.object<Prisma.TransactionClient["invite"]>() });
		td.when(transaction.$queryRaw(td.matchers.anything(), "CODE")).thenDo(async (): Promise<{ id: string }[]> => {
			sequence.push("lock");
			return [{ id: "invite" }];
		});
		td.when(transaction.invite.findUniqueOrThrow(td.matchers.anything())).thenDo(
			async (): Promise<{
				id: string;
				enabled: boolean;
				maxUses: number | null;
				_count: { referredAccounts: number };
			}> => {
				sequence.push("usage");
				return { id: "invite", enabled: true, maxUses: 3, _count: { referredAccounts: 2 } };
			},
		);
		const result = await new InviteRepository(transaction).findAndLockByCode({ code: "CODE" });
		expect({
			result: result,
			sequence: sequence,
			query: td.explain(transaction.$queryRaw).calls.map((call) => call.args),
			reads: td.explain(transaction.invite.findUniqueOrThrow).calls.map((call) => call.args),
		}).toEqual({
			result: { id: "invite", enabled: true, maxUses: 3, uses: 2 },
			sequence: ["lock", "usage"],
			query: [[expect.arrayContaining([expect.stringContaining("FOR UPDATE")]), "CODE"]],
			reads: [
				[
					{
						where: { id: "invite" },
						select: { id: true, enabled: true, maxUses: true, _count: { select: { referredAccounts: true } } },
					},
				],
			],
		});
	});
});
