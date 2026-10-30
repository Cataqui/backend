import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { AccountAdmission } from "../../../generated/prisma/enums";
import { AccountRepository } from "../account/repositories/account.repository";
import { PrismaService } from "../../core/prisma/prisma.service";
import { ProfileService } from "../profile/profile.service";
import { ProfileRepository } from "../profile/repositories/profile.repository";
import { ProfileCreationConflictError } from "../profile/errors/profile-creation-conflict.error";
import { InviteUnavailableError } from "../invite/errors/invite-unavailable.error";
import { WaitlistService } from "./waitlist.service";
import { WaitlistUnitOfWork } from "./waitlist.unit-of-work";

// Opt in only with a disposable PostgreSQL/PostGIS server and Neon WebSocket proxy.
const databaseUrl = process.env["WAITLIST_TEST_DATABASE_URL"];
const proxyAddress = process.env["WAITLIST_TEST_WS_PROXY"];

describe.skipIf(databaseUrl === undefined || proxyAddress === undefined)(
	"Waitlist admission against PostgreSQL",
	() => {
		let admin: Pool;
		let database: Pool;
		let databaseName: string;
		let prisma: PrismaService;
		let service: WaitlistService;
		let unitOfWork: WaitlistUnitOfWork;
		let profileService: ProfileService;
		let migratedIds: string[];

		beforeAll(async () => {
			neonConfig.wsProxy = proxyAddress!;
			neonConfig.useSecureWebSocket = false;
			neonConfig.pipelineConnect = false;
			admin = new Pool({ connectionString: databaseUrl });
			databaseName = `waitlist_test_${randomUUID().replaceAll("-", "")}`;
			await admin.query(`CREATE DATABASE "${databaseName}"`);
			const connection = new URL(databaseUrl!);
			connection.pathname = `/${databaseName}`;
			database = new Pool({ connectionString: connection.toString() });
			migratedIds = [randomUUID(), randomUUID()];
			const migrations = new URL("../../../prisma/schema/migrations/", import.meta.url);
			for (const directory of readdirSync(migrations, { withFileTypes: true })
				.filter((entry) => entry.isDirectory())
				.sort((left, right) => left.name.localeCompare(right.name))) {
				await database.query(readFileSync(new URL(`${directory.name}/migration.sql`, migrations), "utf8"));
				if (directory.name === "20261029180000_introduce_account_admission") {
					await database.query(
						"INSERT INTO accounts (id, admission, onboarding_completed) VALUES ($1, 'WAITLISTED', false), ($2, 'ADMITTED', true)",
						migratedIds,
					);
				}
			}
			prisma = new PrismaService({
				appPoolerUrl: connection.toString(),
				minimumPoolConnections: 1,
				statementTimeoutMs: 5000,
				queryTimeoutMs: 6000,
				lockTimeoutMs: 3000,
				connectionTimeoutMs: 10000,
			});
			await prisma.$connect();
			unitOfWork = new WaitlistUnitOfWork(prisma);
			service = new WaitlistService(unitOfWork);
			profileService = new ProfileService(new ProfileRepository(prisma));
		}, 30000);

		afterAll(async () => {
			await prisma?.$disconnect();
			await database?.end();
			if (databaseName !== undefined) await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
			await admin?.end();
		});

		it("preserves existing admission and onboarding while initializing attribution to null", async () => {
			const accounts = await prisma.account.findMany({ where: { id: { in: migratedIds } } });
			expect(migratedIds.map((id) => accounts.find((account) => account.id === id))).toEqual([
				{
					id: migratedIds[0],
					admission: AccountAdmission.WAITLISTED,
					onboardingCompleted: false,
					fromInviteId: null,
				},
				{ id: migratedIds[1], admission: AccountAdmission.ADMITTED, onboardingCompleted: true, fromInviteId: null },
			]);
		});
		it("creates missing accounts with NOT_REQUESTED admission", async () => {
			const id = randomUUID();
			expect(await new AccountRepository(prisma).getOrCreate({ accountId: id })).toEqual({
				id: id,
				admission: AccountAdmission.NOT_REQUESTED,
				onboardingCompleted: false,
				fromInviteId: null,
			});
		});
		it("joins once across concurrent first requests without creating a profile", async () => {
			const id = randomUUID();
			await Promise.all(Array.from({ length: 8 }, () => service.join({ accountId: id })));
			expect({
				accounts: await prisma.account.findMany({ where: { id: id } }),
				profile: await prisma.profile.findUnique({ where: { id: id } }),
			}).toEqual({
				accounts: [{ id: id, admission: AccountAdmission.WAITLISTED, onboardingCompleted: false, fromInviteId: null }],
				profile: null,
			});
		});
		it("consumes one use across concurrent waitlist skips from the same account", async () => {
			const id = randomUUID();
			const invite = await prisma.invite.create({
				data: { code: randomUUID().toUpperCase(), referrerName: "Partner", maxUses: 1 },
			});
			await prisma.account.create({
				data: { id: id, admission: AccountAdmission.WAITLISTED, onboardingCompleted: true },
			});
			await Promise.all(
				Array.from({ length: 8 }, () => service.skip({ accountId: id, input: { inviteCode: invite.code } })),
			);
			expect({
				account: await prisma.account.findUnique({ where: { id: id } }),
				uses: await prisma.account.count({ where: { fromInviteId: invite.id } }),
				profiles: await prisma.profile.count({ where: { id: id } }),
			}).toEqual({
				account: {
					id: id,
					admission: AccountAdmission.ADMITTED,
					onboardingCompleted: true,
					fromInviteId: invite.id,
				},
				uses: 1,
				profiles: 0,
			});
		});
		it("allows only one account to use the final invite slot", async () => {
			const invite = await prisma.invite.create({
				data: { code: randomUUID().toUpperCase(), referrerName: "Partner", maxUses: 1 },
			});
			const ids = Array.from({ length: 8 }, () => randomUUID());
			await prisma.account.createMany({
				data: ids.map((id, index) => ({
					id: id,
					admission: index % 2 === 0 ? AccountAdmission.NOT_REQUESTED : AccountAdmission.WAITLISTED,
				})),
			});
			const results = await Promise.allSettled(
				ids.map((id) => service.skip({ accountId: id, input: { inviteCode: invite.code } })),
			);
			expect({
				successes: results.filter((result) => result.status === "fulfilled").length,
				unavailable: results.filter(
					(result) => result.status === "rejected" && result.reason instanceof InviteUnavailableError,
				).length,
				admitted: await prisma.account.count({ where: { id: { in: ids }, admission: AccountAdmission.ADMITTED } }),
				uses: await prisma.account.count({ where: { fromInviteId: invite.id } }),
			}).toEqual({ successes: 1, unavailable: 7, admitted: 1, uses: 1 });
		});
		it("allows multiple accounts to skip the waitlist with an unlimited code", async () => {
			const invite = await prisma.invite.create({
				data: { code: randomUUID().toUpperCase(), referrerName: "Partner" },
			});
			await Promise.all(
				Array.from({ length: 5 }, async (): Promise<void> => {
					const id = randomUUID();
					await service.join({ accountId: id });
					await service.skip({ accountId: id, input: { inviteCode: invite.code } });
				}),
			);
			expect(await prisma.account.count({ where: { fromInviteId: invite.id } })).toBe(5);
		});
		it("preserves admitted state through concurrent joins and waitlist skips", async () => {
			const id = randomUUID();
			const invite = await prisma.invite.create({
				data: { code: randomUUID().toUpperCase(), referrerName: "Partner" },
			});
			await Promise.all([
				...Array.from({ length: 8 }, () => service.join({ accountId: id })),
				service.skip({ accountId: id, input: { inviteCode: invite.code } }),
			]);
			expect(await prisma.account.findUnique({ where: { id: id } })).toEqual({
				id: id,
				admission: AccountAdmission.ADMITTED,
				onboardingCompleted: false,
				fromInviteId: invite.id,
			});
		});
		it("retries skipping the waitlist after code disabling, exhaustion and profile creation", async () => {
			const id = randomUUID();
			const invite = await prisma.invite.create({
				data: { code: randomUUID().toUpperCase(), referrerName: "Partner", maxUses: 1 },
			});
			await service.join({ accountId: id });
			await service.skip({ accountId: id, input: { inviteCode: invite.code } });
			await profileService.create({ profileId: id, input: { name: "Maria", initialContacts: [] } });
			await prisma.invite.update({ where: { id: invite.id }, data: { enabled: false } });
			const result = await service.skip({ accountId: id, input: { inviteCode: invite.code } });
			expect({ result: result, uses: await prisma.account.count({ where: { fromInviteId: invite.id } }) }).toEqual({
				result: undefined,
				uses: 1,
			});
		});
		it("accepts another code after admission without changing attribution or consuming its capacity", async () => {
			const id = randomUUID();
			const invites = await Promise.all(
				Array.from({ length: 2 }, () =>
					prisma.invite.create({ data: { code: randomUUID().toUpperCase(), referrerName: "Partner" } }),
				),
			);
			const [first, second] = invites;
			await service.join({ accountId: id });
			await service.skip({ accountId: id, input: { inviteCode: first!.code } });
			const result = await service.skip({ accountId: id, input: { inviteCode: second!.code } });
			expect({
				result: result,
				account: await prisma.account.findUnique({ where: { id: id } }),
				secondUses: await prisma.account.count({ where: { fromInviteId: second!.id } }),
			}).toEqual({
				result: undefined,
				account: {
					id: id,
					admission: AccountAdmission.ADMITTED,
					onboardingCompleted: false,
					fromInviteId: first!.id,
				},
				secondUses: 0,
			});
		});
		it("preserves admitted accounts without invite attribution when supplied an unknown code", async () => {
			const id = randomUUID();
			await prisma.account.create({
				data: { id: id, admission: AccountAdmission.ADMITTED, onboardingCompleted: true },
			});
			const result = await service.skip({ accountId: id, input: { inviteCode: "UNKNOWN" } });
			expect({ result: result, account: await prisma.account.findUniqueOrThrow({ where: { id: id } }) }).toEqual({
				result: undefined,
				account: { id: id, admission: AccountAdmission.ADMITTED, onboardingCompleted: true, fromInviteId: null },
			});
		});
		it("admits once when concurrent requests from one account supply different codes", async () => {
			const id = randomUUID();
			const invites = await Promise.all(
				Array.from({ length: 2 }, () =>
					prisma.invite.create({ data: { code: randomUUID().toUpperCase(), referrerName: "Partner", maxUses: 1 } }),
				),
			);
			await service.join({ accountId: id });
			const results = await Promise.all(
				invites.map((invite) => service.skip({ accountId: id, input: { inviteCode: invite.code } })),
			);
			const account = await prisma.account.findUniqueOrThrow({ where: { id: id } });
			expect({
				results: results,
				admission: account.admission,
				linked: invites.some((invite) => invite.id === account.fromInviteId),
				uses: await prisma.account.count({ where: { fromInviteId: { in: invites.map((invite) => invite.id) } } }),
			}).toEqual({
				results: [undefined, undefined],
				admission: AccountAdmission.ADMITTED,
				linked: true,
				uses: 1,
			});
		});
		it.each([null, AccountAdmission.NOT_REQUESTED, AccountAdmission.WAITLISTED])(
			"admits directly with a valid invite from account state %s",
			async (admission) => {
				const id = randomUUID();
				const invite = await prisma.invite.create({
					data: { code: randomUUID().toUpperCase(), referrerName: "Partner", maxUses: 1 },
				});
				if (admission !== null) {
					await prisma.account.create({ data: { id: id, admission: admission, onboardingCompleted: true } });
				}
				const result = await service.skip({ accountId: id, input: { inviteCode: invite.code } });
				expect({
					result: result,
					account: await prisma.account.findUniqueOrThrow({ where: { id: id } }),
					uses: await prisma.account.count({ where: { fromInviteId: invite.id } }),
					profile: await prisma.profile.findUnique({ where: { id: id } }),
				}).toEqual({
					result: undefined,
					account: {
						id: id,
						admission: AccountAdmission.ADMITTED,
						onboardingCompleted: admission !== null,
						fromInviteId: invite.id,
					},
					uses: 1,
					profile: null,
				});
			},
		);
		it.each(
			[null, AccountAdmission.NOT_REQUESTED, AccountAdmission.WAITLISTED].flatMap((admission) =>
				["unknown", "disabled", "exhausted"].map((state) => ({ admission: admission, state: state })),
			),
		)("preserves account state $admission and capacity for $state invites", async ({ admission, state }) => {
			const id = randomUUID();
			if (admission !== null) {
				await prisma.account.create({ data: { id: id, admission: admission, onboardingCompleted: true } });
			}
			const invite = await prisma.invite.create({
				data: { code: randomUUID().toUpperCase(), referrerName: "Partner", enabled: state !== "disabled", maxUses: 1 },
			});
			if (state === "exhausted") {
				await prisma.account.create({
					data: { id: randomUUID(), admission: AccountAdmission.ADMITTED, fromInviteId: invite.id },
				});
			}
			const result = await service
				.skip({
					accountId: id,
					input: { inviteCode: state === "unknown" ? randomUUID().toUpperCase() : invite.code },
				})
				.catch((error: unknown): unknown => error);
			expect({
				rejected: result instanceof InviteUnavailableError,
				account: await prisma.account.findUnique({ where: { id: id } }),
				uses: await prisma.account.count({ where: { fromInviteId: invite.id } }),
			}).toEqual({
				rejected: true,
				account:
					admission === null ? null : { id: id, admission: admission, onboardingCompleted: true, fromInviteId: null },
				uses: state === "exhausted" ? 1 : 0,
			});
		});

		it.each([null, AccountAdmission.NOT_REQUESTED, AccountAdmission.WAITLISTED])(
			"rolls back account creation, admission, attribution and usage from %s on failure",
			async (admission) => {
				const id = randomUUID();
				const failure = new Error("later operation failed");
				const invite = await prisma.invite.create({
					data: { code: randomUUID().toUpperCase(), referrerName: "Partner", maxUses: 1 },
				});
				if (admission !== null) await prisma.account.create({ data: { id: id, admission: admission } });
				const result = await unitOfWork
					.execute(async ({ accountService, inviteService }): Promise<void> => {
						await accountService.get({ accountId: id });
						const code = await inviteService.lockAvailableByCode({ code: invite.code });
						await accountService.setFromInvite({ accountId: id, inviteId: code!.id });
						await accountService.updateAdmission({
							accountId: id,
							admission: AccountAdmission.ADMITTED,
						});
						throw failure;
					})
					.catch((error: unknown): unknown => error);
				expect({
					result: result,
					account: await prisma.account.findUnique({ where: { id: id } }),
					uses: await prisma.account.count({ where: { fromInviteId: invite.id } }),
				}).toEqual({
					result: failure,
					account:
						admission === null
							? null
							: { id: id, admission: admission, onboardingCompleted: false, fromInviteId: null },
					uses: 0,
				});
			},
		);
		it("rolls back referral assignment when the following admission write fails", async () => {
			const id = randomUUID();
			const failure = new Error("admission update failed");
			const invite = await prisma.invite.create({
				data: { code: randomUUID().toUpperCase(), referrerName: "Partner", maxUses: 1 },
			});
			await service.join({ accountId: id });
			const update = vi.spyOn(AccountRepository.prototype, "updateAdmission").mockRejectedValueOnce(failure);
			let result: unknown;
			try {
				result = await service
					.skip({ accountId: id, input: { inviteCode: invite.code } })
					.catch((error: unknown): unknown => error);
			} finally {
				update.mockRestore();
			}
			expect({
				result: result,
				account: await prisma.account.findUnique({ where: { id: id } }),
				uses: await prisma.account.count({ where: { fromInviteId: invite.id } }),
			}).toEqual({
				result: failure,
				account: { id: id, admission: AccountAdmission.WAITLISTED, onboardingCompleted: false, fromInviteId: null },
				uses: 0,
			});
		});

		it("commits one concurrent scope and rolls back another without mixing repository bindings", async () => {
			const ids = [randomUUID(), randomUUID()];
			await Promise.all(ids.map((id) => service.join({ accountId: id })));
			let releaseWrite: () => void = (): void => {};
			let signalWritten: () => void = (): void => {};
			const written = new Promise<void>((resolve) => {
				signalWritten = resolve;
			});
			const release = new Promise<void>((resolve) => {
				releaseWrite = resolve;
			});
			const first = unitOfWork.execute(async ({ accountService }): Promise<void> => {
				await accountService.updateAdmission({ accountId: ids[0]!, admission: AccountAdmission.ADMITTED });
				signalWritten();
				await release;
			});
			const failure = new Error("second scope failed");
			let secondResult: unknown;
			try {
				await written;
				secondResult = await unitOfWork
					.execute(async ({ accountService }): Promise<void> => {
						await accountService.updateAdmission({ accountId: ids[1]!, admission: AccountAdmission.ADMITTED });
						throw failure;
					})
					.catch((error: unknown): unknown => error);
			} finally {
				releaseWrite();
				await first;
			}
			const accounts = await prisma.account.findMany({ where: { id: { in: ids } } });
			expect({
				result: secondResult,
				admissions: ids.map((id) => accounts.find((account) => account.id === id)?.admission),
			}).toEqual({ result: failure, admissions: [AccountAdmission.ADMITTED, AccountAdmission.WAITLISTED] });
		});
		it.each(Object.values(AccountAdmission))("creates profiles without changing admission %s", async (admission) => {
			const id = randomUUID();
			await prisma.account.create({ data: { id: id, admission: admission } });
			const result = await profileService.create({ profileId: id, input: { name: "Maria", initialContacts: [] } });
			expect({ result: result, account: await prisma.account.findUnique({ where: { id: id } }) }).toEqual({
				result: { created: true, profile: { profileId: id, name: "Maria" } },
				account: { id: id, admission: admission, onboardingCompleted: false, fromInviteId: null },
			});
		});
		it("creates a profile before an API account exists without creating or admitting an account", async () => {
			const id = randomUUID();
			const result = await profileService.create({ profileId: id, input: { name: "Maria", initialContacts: [] } });
			expect({ result: result, account: await prisma.account.findUnique({ where: { id: id } }) }).toEqual({
				result: { created: true, profile: { profileId: id, name: "Maria" } },
				account: null,
			});
		});
		it("creates profiles and contacts atomically and preserves exact retry and conflict behavior", async () => {
			const id = randomUUID();
			await prisma.account.create({ data: { id: id, admission: AccountAdmission.ADMITTED } });
			const input = {
				name: "Maria",
				initialContacts: [{ method: "WHATSAPP", identifier: "@maria.silva" }],
			} satisfies Parameters<ProfileService["create"]>[0]["input"];
			const results = await Promise.all(
				Array.from({ length: 6 }, () => profileService.create({ profileId: id, input: input })),
			);
			const conflict = await profileService
				.create({ profileId: id, input: { name: "Other", initialContacts: [] } })
				.catch((error: unknown): unknown => error);
			expect({
				created: results.filter((result) => result.created).length,
				contacts: await prisma.contact.count({ where: { ownerProfileId: id } }),
				conflict: conflict instanceof ProfileCreationConflictError,
				account: await prisma.account.findUnique({ where: { id: id } }),
			}).toEqual({
				created: 1,
				contacts: 1,
				conflict: true,
				account: { id: id, admission: AccountAdmission.ADMITTED, onboardingCompleted: false, fromInviteId: null },
			});
		});
		it("rolls back profile creation on contact failure without changing prior admission", async () => {
			const id = randomUUID();
			await prisma.account.create({ data: { id: id, admission: AccountAdmission.ADMITTED } });
			const result = await profileService
				.create({
					profileId: id,
					input: { name: "Maria", initialContacts: [{ method: "WHATSAPP", identifier: "x".repeat(321) }] },
				})
				.catch((error: unknown): unknown => error);
			expect({
				failed: result instanceof Error,
				profile: await prisma.profile.findUnique({ where: { id: id } }),
				admission: (await prisma.account.findUniqueOrThrow({ where: { id: id } })).admission,
			}).toEqual({ failed: true, profile: null, admission: AccountAdmission.ADMITTED });
		});
		it.each(["lowercase", "HAS SPACE", "", "A".repeat(65)])("rejects noncanonical stored code %j", async (code) => {
			await expect(prisma.invite.create({ data: { code: code, referrerName: "Partner" } })).rejects.toThrow();
		});
		it.each([0, -1])("rejects nonpositive maxUses %s", async (maxUses) => {
			await expect(
				prisma.invite.create({
					data: { code: randomUUID().toUpperCase(), referrerName: "Partner", maxUses: maxUses },
				}),
			).rejects.toThrow();
		});
		it("restricts deleting a code referenced by an account", async () => {
			const id = randomUUID();
			const invite = await prisma.invite.create({
				data: { code: randomUUID().toUpperCase(), referrerName: "Partner" },
			});
			await service.join({ accountId: id });
			await service.skip({ accountId: id, input: { inviteCode: invite.code } });
			await expect(prisma.invite.delete({ where: { id: invite.id } })).rejects.toThrow();
		});
	},
);
