import { ContactMethod } from "../../../../generated/prisma/client.js";
import type { PrismaService } from "../../../core/prisma/prisma.service";
import { ContactRepository } from "./contact.repository";

const userId = "f3f3f078-9332-4879-9904-6565abc5d88d";

describe("ContactRepository", () => {
	const prisma = { contact: { upsert: vi.fn(), findMany: vi.fn() } };
	const repository = new ContactRepository(prisma as unknown as PrismaService);

	beforeEach(() => vi.resetAllMocks());

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
