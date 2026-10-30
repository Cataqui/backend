import * as td from "testdouble";
import { AccountAdmission } from "../../../generated/prisma/enums";
import type { AccountService } from "../account/account.service";
import { InviteUnavailableError } from "../invite/errors/invite-unavailable.error";
import type { InviteService } from "../invite/invite.service";
import { WaitlistService } from "./waitlist.service";
import type { WaitlistUnitOfWork } from "./waitlist.unit-of-work";

afterEach(() => td.reset());

describe("WaitlistService", () => {
	let accountService: AccountService;
	let inviteService: InviteService;
	let unitOfWork: WaitlistUnitOfWork;
	let service: WaitlistService;
	beforeEach(() => {
		accountService = td.object<AccountService>();
		inviteService = td.object<InviteService>();
		unitOfWork = td.object<WaitlistUnitOfWork>();
		td.when(unitOfWork.execute(td.matchers.anything())).thenDo(
			async (operation: Parameters<WaitlistUnitOfWork["execute"]>[0]): Promise<unknown> =>
				operation({ accountService: accountService, inviteService: inviteService }),
		);
		service = new WaitlistService(unitOfWork);
	});

	it.each(Object.values(AccountAdmission))("joins without downgrading admission %s", async (admission) => {
		td.when(accountService.get({ accountId: "account" })).thenResolve({
			id: "account",
			admission: admission,
			fromInviteId: null,
			onboardingCompleted: false,
		});
		const result = await service.join({ accountId: "account" });
		expect({
			result: result,
			writes: td.explain(accountService.updateAdmission).calls.map((call) => call.args),
			codes: td.explain(inviteService.lockAvailableByCode).callCount,
		}).toEqual({
			result: undefined,
			writes:
				admission === AccountAdmission.NOT_REQUESTED
					? [[{ accountId: "account", admission: AccountAdmission.WAITLISTED }]]
					: [],
			codes: 0,
		});
	});

	it.each([null, "recorded-invite"])(
		"succeeds immediately for admitted accounts with attribution %s",
		async (fromInviteId) => {
			td.when(accountService.get({ accountId: "account" })).thenResolve({
				id: "account",
				admission: AccountAdmission.ADMITTED,
				fromInviteId: fromInviteId,
				onboardingCompleted: false,
			});
			const result = await service.skip({ accountId: "account", input: { inviteCode: "OTHER-CODE" } });
			expect({
				result: result,
				codeReads: td.explain(inviteService.lockAvailableByCode).callCount,
				writes: td.explain(accountService.updateAdmission).callCount,
				attributionWrites: td.explain(accountService.setFromInvite).callCount,
			}).toEqual({ result: undefined, codeReads: 0, writes: 0, attributionWrites: 0 });
		},
	);

	it.each([AccountAdmission.NOT_REQUESTED, AccountAdmission.WAITLISTED])(
		"propagates unavailable invites without admitting an account from %s",
		async (admission) => {
			td.when(accountService.get({ accountId: "account" })).thenResolve({
				id: "account",
				admission: admission,
				fromInviteId: null,
				onboardingCompleted: false,
			});
			const failure = new InviteUnavailableError();
			td.when(inviteService.lockAvailableByCode({ code: "CODE" })).thenReject(failure);
			const result = await service
				.skip({ accountId: "account", input: { inviteCode: "CODE" } })
				.catch((error: unknown): unknown => error);
			expect({
				result: result,
				writes: td.explain(accountService.updateAdmission).callCount,
				attributionWrites: td.explain(accountService.setFromInvite).callCount,
			}).toEqual({ result: failure, writes: 0, attributionWrites: 0 });
		},
	);

	it.each([AccountAdmission.NOT_REQUESTED, AccountAdmission.WAITLISTED])(
		"admits and attributes an available code from %s after locking the account",
		async (admission) => {
			const sequence: string[] = [];
			td.when(accountService.get({ accountId: "account" })).thenDo(
				async (): Promise<Awaited<ReturnType<AccountService["get"]>>> => {
					sequence.push("account locked");
					return {
						id: "account",
						admission: admission,
						fromInviteId: null,
						onboardingCompleted: false,
					};
				},
			);
			td.when(inviteService.lockAvailableByCode({ code: "CODE" })).thenDo(
				async (): Promise<Awaited<ReturnType<InviteService["lockAvailableByCode"]>>> => {
					sequence.push("code locked and counted");
					return { id: "invite" };
				},
			);
			td.when(accountService.setFromInvite(td.matchers.anything())).thenDo(async (): Promise<void> => {
				await Promise.resolve();
				sequence.push("attribution saved");
			});
			td.when(accountService.updateAdmission(td.matchers.anything())).thenDo(async (): Promise<void> => {
				sequence.push("admission saved");
			});
			const result = await service.skip({ accountId: "account", input: { inviteCode: "CODE" } });
			expect({
				result: result,
				sequence: sequence,
				writes: td.explain(accountService.updateAdmission).calls.map((call) => call.args),
				attributionWrites: td.explain(accountService.setFromInvite).calls.map((call) => call.args),
			}).toEqual({
				result: undefined,
				sequence: ["account locked", "code locked and counted", "attribution saved", "admission saved"],
				writes: [[{ accountId: "account", admission: AccountAdmission.ADMITTED }]],
				attributionWrites: [[{ accountId: "account", inviteId: "invite" }]],
			});
		},
	);

	it.each(["join", "skip"] as const)("propagates Unit of Work failures from %s", async (operation) => {
		const failure = new Error("transaction failed");
		td.reset();
		td.when(unitOfWork.execute(td.matchers.anything())).thenReject(failure);
		await expect(service[operation]({ accountId: "account", input: { inviteCode: "CODE" } })).rejects.toBe(failure);
	});
	it("does not attempt admission when recording the referral fails", async () => {
		const failure = new Error("referral update failed");
		td.when(accountService.get({ accountId: "account" })).thenResolve({
			id: "account",
			admission: AccountAdmission.WAITLISTED,
			onboardingCompleted: false,
			fromInviteId: null,
		});
		td.when(inviteService.lockAvailableByCode({ code: "CODE" })).thenResolve({
			id: "invite",
		});
		td.when(accountService.setFromInvite({ accountId: "account", inviteId: "invite" })).thenReject(failure);
		const result = await service
			.skip({ accountId: "account", input: { inviteCode: "CODE" } })
			.catch((error: unknown): unknown => error);
		expect({ result: result, admissionWrites: td.explain(accountService.updateAdmission).callCount }).toEqual({
			result: failure,
			admissionWrites: 0,
		});
	});
});
