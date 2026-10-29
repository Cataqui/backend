import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { AccountAdmission } from "../../../../generated/prisma/enums";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { AccountRepository } from "./account.repository";

// Opt in with a disposable local PostgreSQL server and Neon WebSocket proxy.
const databaseUrl = process.env["ACCOUNT_TEST_DATABASE_URL"];
const proxyAddress = process.env["ACCOUNT_TEST_WS_PROXY"];

describe.skipIf(databaseUrl === undefined || proxyAddress === undefined)(
	"Account migration and persistence against PostgreSQL",
	() => {
		let admin: Pool;
		let database: Pool;
		let prisma: PrismaService;
		let repository: AccountRepository;
		let databaseName: string;
		let migratedIds: string[];

		beforeAll(async () => {
			neonConfig.wsProxy = proxyAddress!;
			neonConfig.useSecureWebSocket = false;
			neonConfig.pipelineConnect = false;
			admin = new Pool({ connectionString: databaseUrl });
			databaseName = `account_test_${randomUUID().replaceAll("-", "")}`;
			await admin.query(`CREATE DATABASE "${databaseName}"`);
			const connection = new URL(databaseUrl!);
			connection.pathname = `/${databaseName}`;
			database = new Pool({ connectionString: connection.toString() });
			await database.query(
				readFileSync(
					new URL(
						"../../../../prisma/schema/migrations/20261022183000_add_account_metadata/migration.sql",
						import.meta.url,
					),
					"utf8",
				),
			);
			migratedIds = [randomUUID(), randomUUID()];
			await database.query(
				"INSERT INTO account_metadata (account_id, onboarding_completed) VALUES ($1, false), ($2, true)",
				migratedIds,
			);
			await database.query(
				readFileSync(
					new URL(
						"../../../../prisma/schema/migrations/20261029180000_introduce_account_admission/migration.sql",
						import.meta.url,
					),
					"utf8",
				),
			);
			prisma = new PrismaService({
				appPoolerUrl: connection.toString(),
				minimumPoolConnections: 1,
				statementTimeoutMs: 5000,
				queryTimeoutMs: 6000,
				lockTimeoutMs: 1000,
				connectionTimeoutMs: 10000,
			});
			await prisma.$connect();
			repository = new AccountRepository(prisma);
		});

		afterAll(async () => {
			await prisma?.$disconnect();
			await database?.end();
			if (databaseName !== undefined) await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
			await admin?.end();
		});

		it("preserves existing IDs and onboarding progress while waitlisting all migrated accounts", async () => {
			const accounts = await prisma.account.findMany({ where: { id: { in: migratedIds } } });
			expect(migratedIds.map((id) => accounts.find((account) => account.id === id))).toEqual([
				{ id: migratedIds[0], admission: AccountAdmission.WAITLISTED, onboardingCompleted: false },
				{ id: migratedIds[1], admission: AccountAdmission.WAITLISTED, onboardingCompleted: true },
			]);
		});

		it("creates one default account across concurrent first retrievals", async () => {
			const accountId = randomUUID();
			const results = await Promise.all(
				Array.from({ length: 12 }, () => repository.getOrCreate({ accountId: accountId })),
			);
			const rows = await prisma.account.findMany({ where: { id: accountId } });
			const expected = { id: accountId, admission: AccountAdmission.WAITLISTED, onboardingCompleted: false };
			expect({ results: results, rows: rows }).toEqual({
				results: Array.from({ length: 12 }, () => expected),
				rows: [expected],
			});
		});

		it("creates an account when onboarding is completed before the first retrieval", async () => {
			const accountId = randomUUID();
			await repository.completeOnboarding({ accountId: accountId });
			expect(await repository.getOrCreate({ accountId: accountId })).toEqual({
				id: accountId,
				admission: AccountAdmission.WAITLISTED,
				onboardingCompleted: true,
			});
		});

		it.each(Object.values(AccountAdmission))(
			"preserves admission %s through repeated completion and retrieval",
			async (admission) => {
				const accountId = randomUUID();
				await prisma.account.create({ data: { id: accountId, admission: admission } });
				await Promise.all(Array.from({ length: 8 }, () => repository.completeOnboarding({ accountId: accountId })));
				expect(await repository.getOrCreate({ accountId: accountId })).toEqual({
					id: accountId,
					admission: admission,
					onboardingCompleted: true,
				});
			},
		);

		it("keeps onboarding completion isolated between accounts", async () => {
			const completedId = randomUUID();
			const otherId = randomUUID();
			await repository.completeOnboarding({ accountId: completedId });
			expect(await repository.getOrCreate({ accountId: otherId })).toEqual({
				id: otherId,
				admission: AccountAdmission.WAITLISTED,
				onboardingCompleted: false,
			});
		});
	},
);
