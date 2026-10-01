import { UserRepository } from "./repositories/user.repository";
import { UserService } from "./user.service";

describe("UserService", () => {
	it("should return current user information for the authenticated session", async () => {
		const findCurrentUserForSession = vi.fn().mockResolvedValue({ userId: "user-id", displayIdentifier: "Ana Silva" });
		const service = new UserService({
			findCurrentUserForSession: findCurrentUserForSession,
		} as unknown as UserRepository);

		const result = await service.getCurrentUser({ sessionId: "session-id", userId: "user-id" });

		expect({ result: result, query: findCurrentUserForSession.mock.calls[0]?.[0] }).toEqual({
			result: { userId: "user-id", displayIdentifier: "Ana Silva" },
			query: { sessionId: "session-id", userId: "user-id" },
		});
	});
});
