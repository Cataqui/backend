import * as td from "testdouble";
import type { Account } from "../../../generated/prisma/client";
import { AccountAdmission } from "../../../generated/prisma/enums";
import { AccountService } from "./account.service";
import { AccountInviteAlreadySetError } from "./errors/account-invite-already-set.error";
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
		const account = {
			id: "account",
			admission: admission,
			onboardingCompleted: true,
			fromInviteId: null,
		} satisfies Account;
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

	it.each(Object.values(AccountAdmission))(
		"updates admission to %s without returning account data",
		async (admission) => {
			td.when(repository.updateAdmission({ accountId: "account", admission: admission })).thenResolve(undefined);
			const result = await service.updateAdmission({ accountId: "account", admission: admission });
			expect({ result: result, calls: td.explain(repository.updateAdmission).calls.map((call) => call.args) }).toEqual({
				result: undefined,
				calls: [[{ accountId: "account", admission: admission }]],
			});
		},
	);

	it("records invite attribution without returning account data", async () => {
		td.when(repository.setFromInviteIfEmpty({ accountId: "account", inviteId: "invite" })).thenResolve(true);
		const result = await service.setFromInvite({ accountId: "account", inviteId: "invite" });
		expect({
			result: result,
			calls: td.explain(repository.setFromInviteIfEmpty).calls.map((call) => call.args),
		}).toEqual({
			result: undefined,
			calls: [[{ accountId: "account", inviteId: "invite" }]],
		});
	});

	it("rejects an invite assignment when the account already has attribution", async () => {
		td.when(repository.setFromInviteIfEmpty({ accountId: "account", inviteId: "invite" })).thenResolve(false);
		await expect(service.setFromInvite({ accountId: "account", inviteId: "invite" })).rejects.toBeInstanceOf(
			AccountInviteAlreadySetError,
		);
	});

	it.each(["updateAdmission", "setFromInvite"] as const)(
		"propagates persistence failures from %s",
		async (operation) => {
			const failure = new Error("write failed");
			td.when(repository.updateAdmission({ accountId: "account", admission: AccountAdmission.ADMITTED })).thenReject(
				failure,
			);
			td.when(repository.setFromInviteIfEmpty({ accountId: "account", inviteId: "invite" })).thenReject(failure);
			await expect(
				service[operation]({ accountId: "account", admission: AccountAdmission.ADMITTED, inviteId: "invite" }),
			).rejects.toBe(failure);
		},
	);

	it("propagates completion failures", async () => {
		const failure = new Error("write failed");
		td.when(repository.completeOnboarding({ accountId: "account" })).thenReject(failure);
		await expect(service.completeOnboarding({ accountId: "account" })).rejects.toBe(failure);
	});
});
