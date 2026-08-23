import { Test } from "@nestjs/testing";
import { JobContactMethod } from "../../../generated/prisma/client.js";
import { UserRepository } from "./repositories/user.repository";
import { UserService } from "./user.service";

describe("UserService", () => {
	it("should save an immutable contact for the authenticated user's future jobs", async () => {
		const repository = {
			upsertContact: vi.fn().mockResolvedValue({
				id: "550e8400-e29b-41d4-a716-446655440000",
				userId: "f3f3f078-9332-4879-9904-6565abc5d88d",
				contactMethod: JobContactMethod.WHATSAPP,
				identifier: "@cataqui.poster",
				createdAt: new Date("2026-08-09T12:00:00.000Z"),
			}),
			findContactsByUserId: vi.fn(),
		};
		const module = await Test.createTestingModule({
			providers: [UserService, { provide: UserRepository, useValue: repository }],
		}).compile();

		const result = await module.get(UserService).getOrAddContact({
			userId: "f3f3f078-9332-4879-9904-6565abc5d88d",
			contact: { contactMethod: JobContactMethod.WHATSAPP, identifier: "@cataqui.poster" },
		});

		expect({ result: result, call: repository.upsertContact.mock.calls[0]?.[0] }).toEqual({
			result: {
				contactId: "550e8400-e29b-41d4-a716-446655440000",
				contactMethod: JobContactMethod.WHATSAPP,
				identifier: "@cataqui.poster",
			},
			call: {
				userId: "f3f3f078-9332-4879-9904-6565abc5d88d",
				contactMethod: JobContactMethod.WHATSAPP,
				identifier: "@cataqui.poster",
			},
		});
	});

	it("should return every contact owned by the authenticated user", async () => {
		const repository = {
			upsertContact: vi.fn(),
			findContactsByUserId: vi.fn().mockResolvedValue([
				{
					id: "550e8400-e29b-41d4-a716-446655440000",
					userId: "f3f3f078-9332-4879-9904-6565abc5d88d",
					contactMethod: JobContactMethod.WHATSAPP,
					identifier: "@cataqui.poster",
					createdAt: new Date("2026-08-09T12:00:00.000Z"),
				},
			]),
		};
		const module = await Test.createTestingModule({
			providers: [UserService, { provide: UserRepository, useValue: repository }],
		}).compile();

		const result = await module.get(UserService).getContacts({
			userId: "f3f3f078-9332-4879-9904-6565abc5d88d",
		});

		expect(result).toEqual([
			{
				contactId: "550e8400-e29b-41d4-a716-446655440000",
				contactMethod: JobContactMethod.WHATSAPP,
				identifier: "@cataqui.poster",
			},
		]);
	});
});
