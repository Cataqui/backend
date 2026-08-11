import { JobContactMethod } from "../../../../generated/prisma/client.js";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { UserRepository } from "./user.repository";

describe("UserRepository", () => {
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
