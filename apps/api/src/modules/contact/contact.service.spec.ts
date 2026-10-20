import * as td from "testdouble";
import { ContactMethod } from "../../../generated/prisma/client";
import { ContactService } from "./contact.service";
import type { ContactRepository } from "./repositories/contact.repository";

const contactId = "550e8400-e29b-41d4-a716-446655440000";
const ownerProfileId = "f3f3f078-9332-4879-9904-6565abc5d88d";

afterEach(() => td.reset());

describe("ContactService", () => {
	let repository: ContactRepository;
	let service: ContactService;

	beforeEach(() => {
		repository = td.object<ContactRepository>();
		service = new ContactService(repository);
	});

	it("saves a reusable contact for the authenticated profile", async () => {
		td.when(repository.upsertContact(td.matchers.anything())).thenResolve({
			id: contactId,
			ownerProfileId: ownerProfileId,
			createdAt: new Date("2026-08-09T12:15:00.000Z"),
			contactMethod: ContactMethod.WHATSAPP,
			identifier: "@cataqui.poster",
		} satisfies Awaited<ReturnType<ContactRepository["upsertContact"]>>);
		await expect(
			service.getOrAddContact({
				ownerProfileId: ownerProfileId,
				contact: { method: ContactMethod.WHATSAPP, identifier: "@cataqui.poster" },
			}),
		).resolves.toEqual({ contactId: contactId, method: ContactMethod.WHATSAPP, identifier: "@cataqui.poster" });
	});

	it("scopes the saved contact to the authenticated profile and supplied identifier", async () => {
		td.when(repository.upsertContact(td.matchers.anything())).thenResolve({
			id: contactId,
			ownerProfileId: ownerProfileId,
			createdAt: new Date("2026-08-09T12:15:00.000Z"),
			contactMethod: ContactMethod.WHATSAPP,
			identifier: "@cataqui.poster",
		} satisfies Awaited<ReturnType<ContactRepository["upsertContact"]>>);
		await service.getOrAddContact({
			ownerProfileId: ownerProfileId,
			contact: { method: ContactMethod.WHATSAPP, identifier: "@cataqui.poster" },
		});

		expect(td.explain(repository.upsertContact).calls[0]?.args[0]).toEqual({
			ownerProfileId: ownerProfileId,
			contactMethod: ContactMethod.WHATSAPP,
			identifier: "@cataqui.poster",
		});
	});

	it("lists only the authenticated profile's saved contacts", async () => {
		td.when(repository.findContactsByOwnerProfileId(td.matchers.anything())).thenResolve([
			{
				id: contactId,
				ownerProfileId: ownerProfileId,
				createdAt: new Date("2026-08-09T12:15:00.000Z"),
				contactMethod: ContactMethod.WHATSAPP,
				identifier: "@cataqui.poster",
			},
		] satisfies Awaited<ReturnType<ContactRepository["findContactsByOwnerProfileId"]>>);
		await expect(service.getContacts({ ownerProfileId: ownerProfileId })).resolves.toEqual([
			{ contactId: contactId, method: ContactMethod.WHATSAPP, identifier: "@cataqui.poster" },
		]);
	});

	it("scopes the saved contact list to the authenticated profile", async () => {
		td.when(repository.findContactsByOwnerProfileId(td.matchers.anything())).thenResolve([
			{
				id: contactId,
				ownerProfileId: ownerProfileId,
				createdAt: new Date("2026-08-09T12:15:00.000Z"),
				contactMethod: ContactMethod.WHATSAPP,
				identifier: "@cataqui.poster",
			},
		] satisfies Awaited<ReturnType<ContactRepository["findContactsByOwnerProfileId"]>>);
		await service.getContacts({ ownerProfileId: ownerProfileId });

		expect(td.explain(repository.findContactsByOwnerProfileId).calls[0]?.args[0]).toEqual({
			ownerProfileId: ownerProfileId,
		});
	});
});
