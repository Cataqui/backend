import * as td from "testdouble";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { SessionRepository } from "./session.repository";

afterEach(() => td.reset());

describe("SessionRepository", () => {
	let prisma: PrismaClient;
	let repository: SessionRepository;
	const now = new Date("2026-10-19T12:00:00.000Z");
	const refreshExpiresAt = new Date("2026-11-18T12:00:00.000Z");
	const credentials = {
		now: now,
		sessionId: "session-id",
		accountId: "account-id",
		identityId: "identity-id",
		refreshTokenHash: "a".repeat(64),
		refreshExpiresAt: refreshExpiresAt,
	} satisfies Parameters<SessionRepository["create"]>[0];

	beforeEach(() => {
		prisma = td.object<PrismaClient>();
		repository = new SessionRepository(prisma);
	});

	it("stores the account session and resets previous-token recovery state", async () => {
		const stored = { id: "session-id", accountId: "account-id" } satisfies Awaited<
			ReturnType<SessionRepository["create"]>
		>;
		td.when(prisma.session.create(td.matchers.anything())).thenResolve(stored);

		expect(await repository.create(credentials)).toBe(stored);
		td.verify(
			prisma.session.create({
				data: {
					id: "session-id",
					accountId: "account-id",
					identityId: "identity-id",
					lastUsedAt: now,
					previousRefreshTokenHash: null,
					previousRefreshTokenValidUntil: null,
					refreshExpiresAt: refreshExpiresAt,
					refreshTokenHash: "a".repeat(64),
				},
				select: { id: true, accountId: true },
			}),
		);
	});

	it("replaces credentials only for the same account and login identity", async () => {
		const result = { count: 1 } satisfies Prisma.BatchPayload;
		td.when(prisma.session.updateMany(td.matchers.anything())).thenResolve(result);

		expect(await repository.replaceCredentials(credentials)).toBe(result);
		td.verify(
			prisma.session.updateMany({
				where: { id: "session-id", accountId: "account-id", identityId: "identity-id" },
				data: {
					lastUsedAt: now,
					previousRefreshTokenHash: null,
					previousRefreshTokenValidUntil: null,
					refreshExpiresAt: refreshExpiresAt,
					refreshTokenHash: "a".repeat(64),
				},
			}),
		);
	});

	it("returns raw missing and stored session results", async () => {
		td.when(prisma.session.findUnique(td.matchers.anything())).thenResolve(null);
		expect(await repository.findById({ sessionId: "session-id" })).toBeNull();
		td.verify(
			prisma.session.findUnique({
				where: { id: "session-id" },
				select: {
					id: true,
					accountId: true,
					identityId: true,
					previousRefreshTokenHash: true,
					previousRefreshTokenValidUntil: true,
					refreshExpiresAt: true,
					refreshTokenHash: true,
				},
			}),
		);
	});

	it.each([false, true])("compares and rotates the current hash with previous recovery %s", async (recoverPrevious) => {
		const recoveryUntil = new Date("2026-10-19T12:01:00.000Z");
		const result = { count: 1 } satisfies Prisma.BatchPayload;
		td.when(prisma.session.updateMany(td.matchers.anything())).thenResolve(result);

		expect(
			await repository.rotateRefreshToken({
				now: now,
				currentRefreshTokenHash: "a".repeat(64),
				...(recoverPrevious ? { presentedPreviousRefreshTokenHash: "b".repeat(64) } : {}),
				newRefreshExpiresAt: refreshExpiresAt,
				newRefreshTokenHash: "c".repeat(64),
				newPreviousRefreshTokenValidUntil: recoveryUntil,
				sessionId: "session-id",
			}),
		).toBe(result);
		td.verify(
			prisma.session.updateMany({
				where: {
					id: "session-id",
					refreshExpiresAt: { gt: now },
					refreshTokenHash: "a".repeat(64),
					...(recoverPrevious
						? { previousRefreshTokenHash: "b".repeat(64), previousRefreshTokenValidUntil: { gt: now } }
						: {}),
				},
				data: {
					lastUsedAt: now,
					previousRefreshTokenHash: "a".repeat(64),
					previousRefreshTokenValidUntil: recoveryUntil,
					refreshExpiresAt: refreshExpiresAt,
					refreshTokenHash: "c".repeat(64),
				},
			}),
		);
	});

	it("returns a lost compare-and-set without interpreting or deleting it", async () => {
		td.when(prisma.session.updateMany(td.matchers.anything())).thenResolve({ count: 0 } satisfies Prisma.BatchPayload);
		expect(
			await repository.rotateRefreshToken({
				now: now,
				currentRefreshTokenHash: "a".repeat(64),
				newRefreshExpiresAt: refreshExpiresAt,
				newRefreshTokenHash: "b".repeat(64),
				newPreviousRefreshTokenValidUntil: now,
				sessionId: "session-id",
			}),
		).toEqual({ count: 0 });
		expect(td.explain(prisma.session.deleteMany).callCount).toBe(0);
	});

	it("deletes only a session owned by the requested account", async () => {
		td.when(prisma.session.deleteMany(td.matchers.anything())).thenResolve({ count: 1 } satisfies Prisma.BatchPayload);
		expect(await repository.deleteSession({ sessionId: "session-id", accountId: "account-id" })).toEqual({ count: 1 });
		td.verify(prisma.session.deleteMany({ where: { id: "session-id", accountId: "account-id" } }));
	});

	it("returns all session IDs owned by the account", async () => {
		const sessions = [{ id: "one" }, { id: "two" }] satisfies Awaited<ReturnType<SessionRepository["findAll"]>>;
		td.when(prisma.session.findMany({ where: td.matchers.anything(), select: { id: true } })).thenResolve(sessions);
		expect(await repository.findAll({ accountId: "account-id" })).toBe(sessions);
		td.verify(prisma.session.findMany({ where: { accountId: "account-id" }, select: { id: true } }));
	});

	it("deletes only the specified account sessions from the revocation snapshot", async () => {
		td.when(prisma.session.deleteMany(td.matchers.anything())).thenResolve({ count: 2 } satisfies Prisma.BatchPayload);
		expect(await repository.deleteSessions({ accountId: "account-id", sessionIds: ["one", "two"] })).toEqual({
			count: 2,
		});
		td.verify(prisma.session.deleteMany({ where: { accountId: "account-id", id: { in: ["one", "two"] } } }));
	});

	it("deletes refresh sessions whose retention period has ended", async () => {
		td.when(prisma.session.deleteMany(td.matchers.anything())).thenResolve({ count: 3 } satisfies Prisma.BatchPayload);
		expect(await repository.deleteExpired({ now: now })).toEqual({ count: 3 });
		td.verify(prisma.session.deleteMany({ where: { refreshExpiresAt: { lte: now } } }));
	});

	it("preserves database failures for the service", async () => {
		const failure = new Error("database connection failed");
		td.when(prisma.session.findUnique(td.matchers.anything())).thenReject(failure);
		await expect(repository.findById({ sessionId: "session-id" })).rejects.toBe(failure);
	});
});
