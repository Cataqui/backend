import * as td from "testdouble";
import type { PrismaClient } from "../generated/prisma/client";
import { AccountRepository } from "./account.repository";

afterEach(() => td.reset());

describe("AccountRepository", () => {
	it("passes the verified identity fields into the atomic database operation and returns its first row", async () => {
		const prisma = td.object<PrismaClient>();
		const result = { accountId: "account", identityId: "identity" };
		td.when(prisma.$queryRaw(td.matchers.anything())).thenResolve([result]);
		const lastVerifiedAt = new Date("2026-10-19T12:00:00Z");

		expect(
			await new AccountRepository(prisma).saveVerifiedIdentity({
				providerSubject: "provider-subject",
				displayIdentifier: "+55 11 99999-9999",
				identifier: "+5511999999999",
				lastVerifiedAt: lastVerifiedAt,
			}),
		).toBe(result);
		const query: unknown = td.explain(prisma.$queryRaw).calls[0]?.args[0];
		expect(query).toMatchObject({
			values: [
				"provider-subject",
				"+55 11 99999-9999",
				"+5511999999999",
				lastVerifiedAt,
				expect.any(String),
				expect.any(String),
			],
		});
	});

	it("returns an empty provider result without interpreting it", async () => {
		const prisma = td.object<PrismaClient>();
		td.when(prisma.$queryRaw(td.matchers.anything())).thenResolve([]);

		expect(
			await new AccountRepository(prisma).saveVerifiedIdentity({
				providerSubject: "provider-subject",
				displayIdentifier: "+55 11 99999-9999",
				identifier: "+5511999999999",
				lastVerifiedAt: new Date("2026-10-19T12:00:00Z"),
			}),
		).toBeUndefined();
	});

	it("queries the account with identities through its owned account ID", async () => {
		const prisma = td.object<PrismaClient>();
		td.when(prisma.account.findUnique({ where: { id: "account" }, include: { identities: true } })).thenResolve(null);

		expect(await new AccountRepository(prisma).findById({ accountId: "account" })).toBeNull();
	});

	it("preserves provider failures", async () => {
		const prisma = td.object<PrismaClient>();
		const failure = new Error("database failure");
		td.when(prisma.account.findUnique(td.matchers.anything())).thenReject(failure);

		await expect(new AccountRepository(prisma).findById({ accountId: "account" })).rejects.toBe(failure);
	});
});
