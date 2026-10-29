import * as td from "testdouble";
import type { Account } from "../../../../generated/prisma/client";
import { AccountAdmission } from "../../../../generated/prisma/enums";
import type { PrismaService } from "../../../core/prisma/prisma.service";
import { AccountRepository } from "./account.repository";

afterEach(() => td.reset());

describe("AccountRepository", () => {
	let prisma: PrismaService;
	let repository: AccountRepository;
	beforeEach(() => {
		prisma = td.object<PrismaService>();
		Object.defineProperty(prisma, "account", { value: td.object<PrismaService["account"]>() });
		repository = new AccountRepository(prisma);
	});

	it.each(Object.values(AccountAdmission))("preserves existing account fields with admission %s", async (admission) => {
		const account = {
			id: "account",
			admission: admission,
			onboardingCompleted: true,
			fromInviteId: null,
		} satisfies Account;
		td.when(prisma.account.upsert(td.matchers.anything())).thenResolve(account);
		const result = await repository.getOrCreate({ accountId: "account" });
		expect({
			result: result,
			calls: td.explain(prisma.account.upsert).calls.map((call) => call.args),
			extraReads: td.explain(prisma.account.findUniqueOrThrow).callCount,
		}).toEqual({
			result: account,
			calls: [[{ where: { id: "account" }, create: { id: "account" }, update: { id: "account" } }]],
			extraReads: 0,
		});
	});

	it("completes onboarding without overwriting admission or returning a record", async () => {
		td.when(prisma.account.upsert(td.matchers.anything())).thenResolve({ id: "account" });
		const result = await repository.completeOnboarding({ accountId: "account" });
		expect({ result: result, calls: td.explain(prisma.account.upsert).calls.map((call) => call.args) }).toEqual({
			result: undefined,
			calls: [
				[
					{
						where: { id: "account" },
						create: { id: "account", onboardingCompleted: true },
						update: { onboardingCompleted: true },
						select: { id: true },
					},
				],
			],
		});
	});
	it("updates only admission without touching attribution or onboarding", async () => {
		const result = await repository.updateAdmission({ accountId: "account", admission: AccountAdmission.ADMITTED });
		expect({ result: result, writes: td.explain(prisma.account.update).calls.map((call) => call.args) }).toEqual({
			result: undefined,
			writes: [[{ where: { id: "account" }, data: { admission: AccountAdmission.ADMITTED } }]],
		});
	});
	it.each([0, 1])("reports whether an unset invite was assigned with affected count %s", async (count) => {
		td.when(prisma.account.updateMany(td.matchers.anything())).thenResolve({ count: count });
		const result = await repository.setFromInviteIfEmpty({ accountId: "account", inviteId: "invite" });
		expect({
			result: result,
			writes: td.explain(prisma.account.updateMany).calls.map((call) => call.args),
			reads: td.explain(prisma.account.findUniqueOrThrow).callCount,
		}).toEqual({
			result: count === 1,
			writes: [[{ where: { id: "account", fromInviteId: null }, data: { fromInviteId: "invite" } }]],
			reads: 0,
		});
	});

	it.each(["getOrCreate", "completeOnboarding"] as const)("propagates storage failures from %s", async (operation) => {
		const failure = new Error("storage failed");
		td.when(prisma.account.upsert(td.matchers.anything())).thenReject(failure);
		await expect(repository[operation]({ accountId: "account" })).rejects.toBe(failure);
	});
});
