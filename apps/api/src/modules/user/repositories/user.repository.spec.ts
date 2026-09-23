import { JobContactMethod } from "../../../../generated/prisma/client.js";
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
	it("should create or reuse an immutable contact owned by one user", async () => {
		const contact = {
			id: "550e8400-e29b-41d4-a716-446655440000",
			userId: "f3f3f078-9332-4879-9904-6565abc5d88d",
			contactMethod: JobContactMethod.WHATSAPP,
			identifier: "@cataqui.poster",
			createdAt: new Date("2026-08-09T12:00:00.000Z"),
		};
		const prisma = { jobContact: { upsert: vi.fn().mockResolvedValue(contact) } };
		const repository = new UserRepository(prisma as unknown as PrismaService);

		const result = await repository.upsertContact({
			userId: contact.userId,
			contactMethod: contact.contactMethod,
			identifier: contact.identifier,
		});

		expect({ result: result, call: prisma.jobContact.upsert.mock.calls[0]?.[0] }).toEqual({
			result: contact,
			call: {
				where: {
					userId_contactMethod_identifier: {
						userId: contact.userId,
						contactMethod: contact.contactMethod,
						identifier: contact.identifier,
					},
				},
				update: {},
				create: {
					userId: contact.userId,
					contactMethod: contact.contactMethod,
					identifier: contact.identifier,
				},
			},
		});
	});

	it("should list one user's contacts with the newest contact first", async () => {
		const findMany = vi.fn().mockResolvedValue([]);
		const repository = new UserRepository({ jobContact: { findMany: findMany } } as unknown as PrismaService);

		await repository.findContactsByUserId({ userId: "f3f3f078-9332-4879-9904-6565abc5d88d" });

		expect(findMany).toHaveBeenCalledWith({
			where: { userId: "f3f3f078-9332-4879-9904-6565abc5d88d" },
			orderBy: { createdAt: "desc" },
		});
	});
});
