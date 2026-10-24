import * as td from "testdouble";
import type { PrismaService } from "../../../core/prisma/prisma.service";
import { AccountMetadataRepository } from "./account-metadata.repository";

afterEach(() => td.reset());

describe("AccountMetadataRepository", () => {
	let prisma: PrismaService;
	let repository: AccountMetadataRepository;
	beforeEach(() => {
		prisma = td.object<PrismaService>();
		Object.defineProperty(prisma, "accountMetadata", { value: td.object<PrismaService["accountMetadata"]>() });
		repository = new AccountMetadataRepository(prisma);
	});

	it.each([null, { accountId: "account", onboardingCompleted: false }])(
		"returns the provider result for an account lookup: %j",
		async (metadata) => {
			td.when(prisma.accountMetadata.findUnique(td.matchers.anything())).thenResolve(metadata);
			const result = await repository.findByAccountId({ accountId: "account" });
			expect({
				result: result,
				calls: td.explain(prisma.accountMetadata.findUnique).calls.map((call) => call.args),
			}).toEqual({ result: metadata, calls: [[{ where: { accountId: "account" } }]] });
		},
	);

	it.each([true, false])("uses one account-scoped upsert for onboardingCompleted=%s", async (completed) => {
		const metadata = { accountId: "account", onboardingCompleted: completed };
		td.when(prisma.accountMetadata.upsert(td.matchers.anything())).thenResolve(metadata);
		const result = await repository.upsert(metadata);
		expect({ result: result, calls: td.explain(prisma.accountMetadata.upsert).calls.map((call) => call.args) }).toEqual(
			{
				result: metadata,
				calls: [
					[
						{
							where: { accountId: "account" },
							create: { accountId: "account", onboardingCompleted: completed },
							update: { onboardingCompleted: completed },
						},
					],
				],
			},
		);
	});

	it("propagates provider read failures unchanged", async () => {
		const failure = new Error("read failed");
		td.when(prisma.accountMetadata.findUnique(td.matchers.anything())).thenReject(failure);
		await expect(repository.findByAccountId({ accountId: "account" })).rejects.toBe(failure);
	});

	it("propagates provider write failures unchanged", async () => {
		const failure = new Error("write failed");
		td.when(prisma.accountMetadata.upsert(td.matchers.anything())).thenReject(failure);
		await expect(repository.upsert({ accountId: "account", onboardingCompleted: false })).rejects.toBe(failure);
	});
});
