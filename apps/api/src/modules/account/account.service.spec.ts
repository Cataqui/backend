import * as td from "testdouble";
import type { Account } from "../../../generated/prisma/client";
import { AccountAdmission } from "../../../generated/prisma/enums";
import { AccountService } from "./account.service";
import { AccountRepository } from "./repositories/account.repository";

afterEach(() => td.reset());

describe("AccountService", () => {
	let repository: AccountRepository;
	let service: AccountService;

	beforeEach(() => {
		repository = td.object<AccountRepository>();
		service = new AccountService(repository);
	});

	it.each(Object.values(AccountAdmission))("returns the persisted account with admission %s", async (admission) => {
		const account = { id: "account", admission: admission, onboardingCompleted: true } satisfies Account;
		td.when(repository.getOrCreate({ accountId: "account" })).thenResolve(account);
		expect(await service.get({ accountId: "account" })).toEqual(account);
	});

	it("completes onboarding for the authenticated account without returning account data", async () => {
		td.when(repository.completeOnboarding({ accountId: "account" })).thenResolve(undefined);
		const result = await service.completeOnboarding({ accountId: "account" });
		expect({ result: result, calls: td.explain(repository.completeOnboarding).calls.map((call) => call.args) }).toEqual(
			{
				result: undefined,
				calls: [[{ accountId: "account" }]],
			},
		);
	});

	it("propagates retrieval failures", async () => {
		const failure = new Error("read failed");
		td.when(repository.getOrCreate({ accountId: "account" })).thenReject(failure);
		await expect(service.get({ accountId: "account" })).rejects.toBe(failure);
	});

	it("propagates completion failures", async () => {
		const failure = new Error("write failed");
		td.when(repository.completeOnboarding({ accountId: "account" })).thenReject(failure);
		await expect(service.completeOnboarding({ accountId: "account" })).rejects.toBe(failure);
	});
});
