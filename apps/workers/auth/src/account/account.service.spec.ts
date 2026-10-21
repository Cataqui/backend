import * as td from "testdouble";
import type { Prisma } from "../generated/prisma/client";
import { AppErrorCode } from "../errors/app-error-code.enum";
import { AccountRepository } from "./account.repository";
import { AccountService } from "./account.service";

afterEach(() => td.reset());

describe("AccountService", () => {
	it("returns only owned public identity details with ISO verification dates", async () => {
		const repository = td.object<AccountRepository>();
		const account = {
			id: "f884cf46-357f-4fb4-a5a7-d2e4edd97950",
			createdAt: new Date("2026-10-19T12:00:00Z"),
			identities: [
				{
					id: "2069c021-ce33-4171-995a-7045945df4db",
					accountId: "f884cf46-357f-4fb4-a5a7-d2e4edd97950",
					provider: "WHATSAPP",
					providerSubject: "private-provider-subject",
					identifier: "+5511999999999",
					displayIdentifier: "+55 11 99999-9999",
					lastVerifiedAt: new Date("2026-10-19T12:05:00Z"),
					createdAt: new Date("2026-10-19T12:00:00Z"),
					updatedAt: new Date("2026-10-19T12:05:00Z"),
				},
			],
		} satisfies Prisma.AccountGetPayload<{ include: { identities: true } }>;
		td.when(repository.findById({ accountId: account.id })).thenResolve(account);

		const result = await new AccountService(repository).getCurrent({ accountId: account.id });

		expect(result).toEqual({
			accountId: account.id,
			identities: [
				{
					identityId: "2069c021-ce33-4171-995a-7045945df4db",
					provider: "WHATSAPP",
					identifier: "+5511999999999",
					displayIdentifier: "+55 11 99999-9999",
					lastVerifiedAt: "2026-10-19T12:05:00.000Z",
				},
			],
		});
	});

	it("rejects an authenticated account removed from durable storage", async () => {
		const repository = td.object<AccountRepository>();
		td.when(repository.findById({ accountId: "missing-account" })).thenResolve(null);

		await expect(new AccountService(repository).getCurrent({ accountId: "missing-account" })).rejects.toMatchObject({
			errorCode: AppErrorCode.ACCOUNT_NOT_FOUND,
		});
	});

	it("preserves database failures for the owning transport boundary", async () => {
		const repository = td.object<AccountRepository>();
		const failure = new Error("database unavailable");
		td.when(repository.findById({ accountId: "account" })).thenReject(failure);

		await expect(new AccountService(repository).getCurrent({ accountId: "account" })).rejects.toBe(failure);
	});
});
