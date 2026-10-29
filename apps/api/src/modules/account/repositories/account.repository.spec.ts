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
		const account = { id: "account", admission: admission, onboardingCompleted: true } satisfies Account;
		td.when(prisma.account.upsert(td.matchers.anything())).thenResolve(account);
		const result = await repository.getOrCreate({ accountId: "account" });
		expect({ result: result, calls: td.explain(prisma.account.upsert).calls.map((call) => call.args) }).toEqual({
			result: account,
			calls: [[{ where: { id: "account" }, create: { id: "account" }, update: { id: "account" } }]],
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

	it.each(["getOrCreate", "completeOnboarding"] as const)("propagates storage failures from %s", async (operation) => {
		const failure = new Error("storage failed");
		td.when(prisma.account.upsert(td.matchers.anything())).thenReject(failure);
		await expect(repository[operation]({ accountId: "account" })).rejects.toBe(failure);
	});
});
