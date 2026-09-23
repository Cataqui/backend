import { ContactMethod } from "../../../generated/prisma/client.js";
import { ContactService } from "./contact.service";
import type { ContactRepository } from "./repositories/contact.repository";

const contactId = "550e8400-e29b-41d4-a716-446655440000";
const userId = "f3f3f078-9332-4879-9904-6565abc5d88d";
const contact = { id: contactId, contactMethod: ContactMethod.WHATSAPP, identifier: "@cataqui.poster" };

describe("ContactService", () => {
	const repository = { upsertContact: vi.fn(), findContactsByUserId: vi.fn() };
	const service = new ContactService(repository as unknown as ContactRepository);

	beforeEach(() => vi.resetAllMocks());

	it("saves a reusable contact for the authenticated user", async () => {
		repository.upsertContact.mockResolvedValue(contact);
		await expect(
			service.getOrAddContact({
				userId: userId,
				contact: { method: ContactMethod.WHATSAPP, identifier: "@cataqui.poster" },
			}),
		).resolves.toEqual({ contactId: contactId, method: ContactMethod.WHATSAPP, identifier: "@cataqui.poster" });
		expect(repository.upsertContact).toHaveBeenCalledWith({
			userId: userId,
			contactMethod: ContactMethod.WHATSAPP,
			identifier: "@cataqui.poster",
		});
	});

	it("lists only the authenticated user's saved contacts", async () => {
		repository.findContactsByUserId.mockResolvedValue([contact]);
		await expect(service.getContacts({ userId: userId })).resolves.toEqual([
			{ contactId: contactId, method: ContactMethod.WHATSAPP, identifier: "@cataqui.poster" },
		]);
		expect(repository.findContactsByUserId).toHaveBeenCalledWith({ userId: userId });
	});
});
