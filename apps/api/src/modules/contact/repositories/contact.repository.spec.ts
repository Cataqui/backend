import { ContactMethod } from "../../../../generated/prisma/client.js";
import type { PrismaService } from "../../../core/prisma/prisma.service";
import { ContactRepository } from "./contact.repository";

const contactId = "550e8400-e29b-41d4-a716-446655440000";
const userId = "f3f3f078-9332-4879-9904-6565abc5d88d";

describe("ContactRepository", () => {
	const prisma = { contact: { findUnique: vi.fn(), upsert: vi.fn(), findMany: vi.fn() } };
	const repository = new ContactRepository(prisma as unknown as PrismaService);

	beforeEach(() => vi.resetAllMocks());

	it("fetches any contact by ID without an active-job condition", async () => {
		prisma.contact.findUnique.mockResolvedValue({
			contactMethod: ContactMethod.PHONE_CALL,
			identifier: "+5511888888888",
		});
		await expect(repository.findById({ contactId: contactId })).resolves.toEqual({
			contactMethod: ContactMethod.PHONE_CALL,
			identifier: "+5511888888888",
		});
		expect(prisma.contact.findUnique).toHaveBeenCalledWith({
			where: { id: contactId },
			select: { contactMethod: true, identifier: true },
		});
	});

	it("returns null for an unknown contact", async () => {
		prisma.contact.findUnique.mockResolvedValue(null);
		await expect(repository.findById({ contactId: contactId })).resolves.toBeNull();
	});

	it("creates or reuses a user's immutable contact", async () => {
		await repository.upsertContact({
			userId: userId,
			contactMethod: ContactMethod.WHATSAPP,
			identifier: "@cataqui.poster",
		});
		expect(prisma.contact.upsert).toHaveBeenCalledWith({
			where: {
				userId_contactMethod_identifier: {
					userId: userId,
					contactMethod: ContactMethod.WHATSAPP,
					identifier: "@cataqui.poster",
				},
			},
			update: {},
			create: { userId: userId, contactMethod: ContactMethod.WHATSAPP, identifier: "@cataqui.poster" },
		});
	});

	it("lists one user's contacts newest first", async () => {
		await repository.findContactsByUserId({ userId: userId });
		expect(prisma.contact.findMany).toHaveBeenCalledWith({ where: { userId: userId }, orderBy: { createdAt: "desc" } });
	});
});
