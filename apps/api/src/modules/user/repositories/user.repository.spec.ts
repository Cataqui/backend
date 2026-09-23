import { PrismaService } from "../../../core/prisma/prisma.service";
import { AuthSessionUnavailableError } from "../../auth/errors/auth-session-unavailable.error";
import { UserRepository } from "./user.repository";

describe("UserRepository", () => {
	it("should return current user information from the identity used by this session", async () => {
		const findFirst = vi.fn().mockResolvedValue({
			userId: "user-id",
			authIdentity: { displayIdentifier: "Ana Silva" },
		});
		const repository = new UserRepository({ authSession: { findFirst: findFirst } } as unknown as PrismaService);

		const result = await repository.findCurrentUserForSession({
			sessionId: "whatsapp-session",
			userId: "user-id",
		});

		expect({ result: result, query: findFirst.mock.calls[0]?.[0] }).toEqual({
			result: { userId: "user-id", displayIdentifier: "Ana Silva" },
			query: {
				where: { id: "whatsapp-session", userId: "user-id" },
				select: { userId: true, authIdentity: { select: { displayIdentifier: true } } },
			},
		});
	});

	it("should reject a profile read when the session has no verified identity", async () => {
		const findFirst = vi.fn().mockResolvedValue({ authIdentity: null });
		const repository = new UserRepository({ authSession: { findFirst: findFirst } } as unknown as PrismaService);

		await expect(repository.findCurrentUserForSession({ sessionId: "session-id", userId: "user-id" })).rejects.toThrow(
			AuthSessionUnavailableError,
		);
	});
});
