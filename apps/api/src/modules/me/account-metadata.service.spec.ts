import * as td from "testdouble";
import { AccountMetadataService } from "./account-metadata.service";
import { AccountMetadataRepository } from "./repositories/account-metadata.repository";

afterEach(() => td.reset());

describe("AccountMetadataService", () => {
	let repository: AccountMetadataRepository;
	let service: AccountMetadataService;

	beforeEach(() => {
		repository = td.object<AccountMetadataRepository>();
		service = new AccountMetadataService(repository);
	});

	it("returns incomplete onboarding without creating metadata when the account has none", async () => {
		td.when(repository.findByAccountId({ accountId: "account" })).thenResolve(null);
		const result = await service.get({ accountId: "account" });
		expect({ result: result, writes: td.explain(repository.upsert).callCount }).toEqual({
			result: { onboardingCompleted: false },
			writes: 0,
		});
	});

	it.each([true, false])(
		"returns saved onboardingCompleted=%s without exposing the account identifier",
		async (completed) => {
			td.when(repository.findByAccountId({ accountId: "account" })).thenResolve({
				accountId: "account",
				onboardingCompleted: completed,
			});
			expect(await service.get({ accountId: "account" })).toEqual({ onboardingCompleted: completed });
		},
	);

	it.each([true, false])("saves onboardingCompleted=%s for the authenticated account", async (completed) => {
		td.when(repository.upsert({ accountId: "account", onboardingCompleted: completed })).thenResolve({
			accountId: "account",
			onboardingCompleted: completed,
		});
		const result = await service.update({ accountId: "account", input: { onboardingCompleted: completed } });
		expect({
			result: result,
			reads: td.explain(repository.findByAccountId).callCount,
			writes: td.explain(repository.upsert).calls.map((call) => call.args),
		}).toEqual({
			result: { onboardingCompleted: completed },
			reads: 0,
			writes: [[{ accountId: "account", onboardingCompleted: completed }]],
		});
	});

	it.each([null, { accountId: "account", onboardingCompleted: true }])(
		"preserves metadata without writing for an empty patch: %j",
		async (metadata) => {
			td.when(repository.findByAccountId({ accountId: "account" })).thenResolve(metadata);
			const result = await service.update({ accountId: "account", input: {} });
			expect({ result: result, writes: td.explain(repository.upsert).callCount }).toEqual({
				result: { onboardingCompleted: metadata?.onboardingCompleted ?? false },
				writes: 0,
			});
		},
	);

	it("propagates storage read failures", async () => {
		const failure = new Error("read failed");
		td.when(repository.findByAccountId({ accountId: "account" })).thenReject(failure);
		await expect(service.get({ accountId: "account" })).rejects.toBe(failure);
	});

	it("propagates storage write failures", async () => {
		const failure = new Error("write failed");
		td.when(repository.upsert({ accountId: "account", onboardingCompleted: true })).thenReject(failure);
		await expect(service.update({ accountId: "account", input: { onboardingCompleted: true } })).rejects.toBe(failure);
	});
});
