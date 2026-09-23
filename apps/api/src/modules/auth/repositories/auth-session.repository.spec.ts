import { Test } from "@nestjs/testing";
import { Prisma } from "../../../../generated/prisma/client.js";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { AuthSessionUnavailableError } from "../errors/auth-session-unavailable.error";
import { AuthSessionRepository } from "./auth-session.repository";

describe("AuthSessionRepository", () => {
	let repository: AuthSessionRepository;
	let prisma: {
		$transaction: ReturnType<typeof vi.fn>;
		authSession: {
			create: ReturnType<typeof vi.fn>;
			deleteMany: ReturnType<typeof vi.fn>;
			findMany: ReturnType<typeof vi.fn>;
			findUnique: ReturnType<typeof vi.fn>;
			updateMany: ReturnType<typeof vi.fn>;
		};
	};

	beforeEach(async () => {
		prisma = {
			$transaction: vi.fn(),
			authSession: {
				create: vi.fn(),
				deleteMany: vi.fn(),
				findMany: vi.fn(),
				findUnique: vi.fn(),
				updateMany: vi.fn(),
			},
		};
		const module = await Test.createTestingModule({
			providers: [AuthSessionRepository, { provide: PrismaService, useValue: prisma }],
		}).compile();
		repository = module.get(AuthSessionRepository);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("should store one current refresh token and clear previous recovery state on the device session", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-05T15:00:00.000Z"));
		prisma.authSession.create.mockResolvedValue({ id: "session-id", userId: "user-id" });

		await repository.createOrReplaceForUser({
			refreshExpiresAt: new Date("2026-09-04T15:00:00.000Z"),
			refreshTokenHash: "b".repeat(64),
			sessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			userId: "user-id",
			authIdentityId: "identity-id",
		});

		expect(prisma.authSession.create).toHaveBeenCalledWith({
			data: {
				id: "5c474828-dd9e-4490-a45a-0e82512bc45e",
				userId: "user-id",
				authIdentityId: "identity-id",
				lastUsedAt: new Date("2026-08-05T15:00:00.000Z"),
				previousRefreshTokenHash: null,
				previousRefreshTokenValidUntil: null,
				refreshExpiresAt: new Date("2026-09-04T15:00:00.000Z"),
				refreshTokenHash: "b".repeat(64),
			},
			select: { id: true, userId: true },
		});
	});

	it("should return the session identifiers after storing its current refresh token", async () => {
		prisma.authSession.create.mockResolvedValue({ id: "session-id", userId: "user-id" });

		const result = await repository.createOrReplaceForUser({
			refreshExpiresAt: new Date("2026-09-04T15:00:00.000Z"),
			refreshTokenHash: "b".repeat(64),
			sessionId: "session-id",
			userId: "user-id",
			authIdentityId: "identity-id",
		});

		expect(result).toEqual({ sessionId: "session-id", userId: "user-id" });
	});

	it("should reject a preassigned session identifier that belongs to another user", async () => {
		prisma.authSession.create.mockRejectedValue(
			new Prisma.PrismaClientKnownRequestError("unique constraint", {
				code: "P2002",
				clientVersion: "test",
			}),
		);
		prisma.authSession.findUnique.mockResolvedValue({ id: "session-id", userId: "another-user-id" });

		await expect(
			repository.createOrReplaceForUser({
				refreshExpiresAt: new Date("2026-09-04T15:00:00.000Z"),
				refreshTokenHash: "b".repeat(64),
				sessionId: "session-id",
				userId: "user-id",
				authIdentityId: "identity-id",
			}),
		).rejects.toThrow(AuthSessionUnavailableError);
	});

	it("should replace credentials for the same user's preassigned session after an interrupted exchange", async () => {
		prisma.authSession.create.mockRejectedValue(
			new Prisma.PrismaClientKnownRequestError("unique constraint", {
				code: "P2002",
				clientVersion: "test",
			}),
		);
		prisma.authSession.findUnique.mockResolvedValue({
			id: "session-id",
			userId: "user-id",
			authIdentityId: "identity-id",
		});
		prisma.authSession.updateMany.mockResolvedValue({ count: 1 });

		const result = await repository.createOrReplaceForUser({
			refreshExpiresAt: new Date("2026-09-04T15:00:00.000Z"),
			refreshTokenHash: "c".repeat(64),
			sessionId: "session-id",
			userId: "user-id",
			authIdentityId: "identity-id",
		});

		expect(result).toEqual({ sessionId: "session-id", userId: "user-id" });
		expect(prisma.authSession.updateMany).toHaveBeenCalledWith({
			where: { id: "session-id", userId: "user-id" },
			data: {
				lastUsedAt: expect.any(Date),
				previousRefreshTokenHash: null,
				previousRefreshTokenValidUntil: null,
				refreshExpiresAt: new Date("2026-09-04T15:00:00.000Z"),
				refreshTokenHash: "c".repeat(64),
			},
		});
	});

	it("should not reassign a session to another login identity for the same user", async () => {
		prisma.authSession.create.mockRejectedValue(
			new Prisma.PrismaClientKnownRequestError("unique constraint", { code: "P2002", clientVersion: "test" }),
		);
		prisma.authSession.findUnique.mockResolvedValue({
			id: "session-id",
			userId: "user-id",
			authIdentityId: "whatsapp-identity-id",
		});

		await expect(
			repository.createOrReplaceForUser({
				refreshExpiresAt: new Date("2026-09-04T15:00:00.000Z"),
				refreshTokenHash: "b".repeat(64),
				sessionId: "session-id",
				userId: "user-id",
				authIdentityId: "google-identity-id",
			}),
		).rejects.toThrow(AuthSessionUnavailableError);
	});

	it("should return null for an unknown authenticated session family", async () => {
		prisma.authSession.findUnique.mockResolvedValue(null);

		const result = await repository.findRefreshSessionById({ sessionId: "session-id" });

		expect(result).toBeNull();
	});

	it("should return the current refresh state for an authenticated session family", async () => {
		prisma.authSession.findUnique.mockResolvedValue({
			id: "session-id",
			previousRefreshTokenHash: "a".repeat(64),
			previousRefreshTokenValidUntil: new Date("2026-08-05T15:01:00.000Z"),
			refreshExpiresAt: new Date("2026-09-04T15:00:00.000Z"),
			refreshTokenHash: "b".repeat(64),
			userId: "user-id",
		});

		const result = await repository.findRefreshSessionById({ sessionId: "session-id" });

		expect(result).toEqual({
			previousRefreshTokenHash: "a".repeat(64),
			previousRefreshTokenValidUntil: new Date("2026-08-05T15:01:00.000Z"),
			refreshExpiresAt: new Date("2026-09-04T15:00:00.000Z"),
			refreshTokenHash: "b".repeat(64),
			sessionId: "session-id",
			userId: "user-id",
		});
	});

	it("should atomically replace the current hash and rolling expiration", async () => {
		const updateMany = vi.fn().mockResolvedValue({ count: 1 });
		prisma.$transaction.mockImplementation(async (callback: (transaction: unknown) => unknown) =>
			callback({
				authSession: {
					updateMany: updateMany,
					findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "session-id", userId: "user-id" }),
				},
			}),
		);
		const now = new Date("2026-08-05T15:00:00.000Z");
		const nextExpiration = new Date("2026-09-04T15:00:00.000Z");

		await repository.rotateRefreshToken({
			now: now,
			currentRefreshTokenHash: "b".repeat(64),
			newRefreshExpiresAt: nextExpiration,
			newRefreshTokenHash: "c".repeat(64),
			newPreviousRefreshTokenValidUntil: new Date("2026-08-05T15:01:00.000Z"),
			sessionId: "session-id",
		});

		expect(updateMany).toHaveBeenCalledWith({
			where: {
				id: "session-id",
				refreshExpiresAt: { gt: now },
				refreshTokenHash: "b".repeat(64),
			},
			data: {
				lastUsedAt: now,
				previousRefreshTokenHash: "b".repeat(64),
				previousRefreshTokenValidUntil: new Date("2026-08-05T15:01:00.000Z"),
				refreshExpiresAt: nextExpiration,
				refreshTokenHash: "c".repeat(64),
			},
		});
	});

	it("should compare and rotate the current token when recovering with the immediately previous token", async () => {
		const updateMany = vi.fn().mockResolvedValue({ count: 1 });
		prisma.$transaction.mockImplementation(async (callback: (transaction: unknown) => unknown) =>
			callback({
				authSession: {
					updateMany: updateMany,
					findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "session-id", userId: "user-id" }),
				},
			}),
		);
		const now = new Date("2026-08-05T15:00:00.000Z");

		await repository.rotateRefreshToken({
			now: now,
			currentRefreshTokenHash: "b".repeat(64),
			presentedPreviousRefreshTokenHash: "a".repeat(64),
			newRefreshExpiresAt: new Date("2026-09-04T15:00:00.000Z"),
			newRefreshTokenHash: "c".repeat(64),
			newPreviousRefreshTokenValidUntil: new Date("2026-08-05T15:01:00.000Z"),
			sessionId: "session-id",
		});

		expect(updateMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					id: "session-id",
					previousRefreshTokenHash: "a".repeat(64),
					previousRefreshTokenValidUntil: { gt: now },
					refreshExpiresAt: { gt: now },
					refreshTokenHash: "b".repeat(64),
				},
			}),
		);
	});

	it("should return the rotated device session after a successful compare-and-set", async () => {
		prisma.$transaction.mockImplementation(async (callback: (transaction: unknown) => unknown) =>
			callback({
				authSession: {
					updateMany: vi.fn().mockResolvedValue({ count: 1 }),
					findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "session-id", userId: "user-id" }),
				},
			}),
		);
		const nextExpiration = new Date("2026-09-04T15:00:00.000Z");

		const result = await repository.rotateRefreshToken({
			now: new Date("2026-08-05T15:00:00.000Z"),
			currentRefreshTokenHash: "b".repeat(64),
			newRefreshExpiresAt: nextExpiration,
			newRefreshTokenHash: "c".repeat(64),
			newPreviousRefreshTokenValidUntil: new Date("2026-08-05T15:01:00.000Z"),
			sessionId: "session-id",
		});

		expect(result).toEqual({
			status: "ROTATED",
			session: { sessionId: "session-id", userId: "user-id" },
			refreshExpiresAt: nextExpiration,
		});
	});

	it("should delete the device family when the compare-and-set loses a concurrent race", async () => {
		const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
		prisma.$transaction.mockImplementation(async (callback: (transaction: unknown) => unknown) =>
			callback({ authSession: { updateMany: vi.fn().mockResolvedValue({ count: 0 }), deleteMany: deleteMany } }),
		);

		const result = await repository.rotateRefreshToken({
			now: new Date("2026-08-05T15:00:00.000Z"),
			currentRefreshTokenHash: "b".repeat(64),
			newRefreshExpiresAt: new Date("2026-09-04T15:00:00.000Z"),
			newRefreshTokenHash: "c".repeat(64),
			newPreviousRefreshTokenValidUntil: new Date("2026-08-05T15:01:00.000Z"),
			sessionId: "session-id",
		});

		expect({ status: result.status, deletion: deleteMany.mock.calls[0]?.[0] }).toEqual({
			status: "ALREADY_ROTATED",
			deletion: { where: { id: "session-id" } },
		});
	});

	it("should delete only the requested authenticated device session", async () => {
		prisma.authSession.deleteMany.mockResolvedValue({ count: 1 });

		await repository.deleteSession({ sessionId: "session-id", userId: "user-id" });

		expect(prisma.authSession.deleteMany).toHaveBeenCalledWith({
			where: { id: "session-id", userId: "user-id" },
		});
	});

	it("should return every session identifier belonging to the authenticated user", async () => {
		prisma.authSession.findMany.mockResolvedValue([{ id: "session-one" }, { id: "session-two" }]);

		const result = await repository.findAll({ userId: "user-id" });

		expect(result).toEqual([{ sessionId: "session-one" }, { sessionId: "session-two" }]);
	});

	it("should delete every session belonging to the authenticated user", async () => {
		prisma.authSession.deleteMany.mockResolvedValue({ count: 2 });

		await repository.deleteAll({ userId: "user-id" });

		expect(prisma.authSession.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-id" } });
	});

	it("should preserve Prisma failures for the global error boundary", async () => {
		const prismaError = new Prisma.PrismaClientKnownRequestError("database unavailable", {
			code: "P1001",
			clientVersion: "test",
		});
		prisma.authSession.findUnique.mockRejectedValue(prismaError);

		await expect(repository.findRefreshSessionById({ sessionId: "session-id" })).rejects.toBe(prismaError);
	});

	it("should preserve unexpected programming errors", async () => {
		const programmingError = new Error("unexpected mapping bug");
		prisma.authSession.findUnique.mockRejectedValue(programmingError);

		await expect(repository.findRefreshSessionById({ sessionId: "session-id" })).rejects.toBe(programmingError);
	});
});
