import { GUARDS_METADATA, HEADERS_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { Test } from "@nestjs/testing";
import { JobContactMethod } from "../../../generated/prisma/client.js";
import { AccessTokenGuard } from "../auth/guards/access-token.guard";
import { UserController } from "./user.controller";
import { UserService } from "./user.service";

describe("UserController", () => {
	let controller: UserController;
	let userService: { getOrAddContact: ReturnType<typeof vi.fn>; getContacts: ReturnType<typeof vi.fn> };

	beforeEach(async () => {
		userService = { getOrAddContact: vi.fn(), getContacts: vi.fn() };
		const module = await Test.createTestingModule({
			controllers: [UserController],
			providers: [{ provide: UserService, useValue: userService }],
		})
			.overrideGuard(AccessTokenGuard)
			.useValue({ canActivate: vi.fn() })
			.compile();
		controller = module.get(UserController);
	});

	it("should expose user-owned contacts below the users resource", () => {
		expect(Reflect.getMetadata(PATH_METADATA, UserController)).toBe("users");
	});

	it("should require an access token before adding a saved contact", () => {
		expect(Reflect.getMetadata(GUARDS_METADATA, controller.addContact)).toEqual([AccessTokenGuard]);
	});

	it("should require an access token before reading saved contacts", () => {
		expect(Reflect.getMetadata(GUARDS_METADATA, controller.getContacts)).toEqual([AccessTokenGuard]);
	});

	it("should prevent saved contact identifiers from being cached", () => {
		expect(Reflect.getMetadata(HEADERS_METADATA, controller.addContact)).toContainEqual({
			name: "Cache-Control",
			value: "no-store",
		});
	});

	it("should prevent the saved contact collection from being cached", () => {
		expect(Reflect.getMetadata(HEADERS_METADATA, controller.getContacts)).toContainEqual({
			name: "Cache-Control",
			value: "no-store",
		});
	});

	it("should get contacts owned by the authenticated user", async () => {
		const authSession = {
			expiresAt: new Date("2026-08-09T12:15:00.000Z"),
			sessionId: "3e73bbc6-09c8-4c78-87f4-a584a19bca21",
			userId: "f3f3f078-9332-4879-9904-6565abc5d88d",
		};
		userService.getContacts.mockResolvedValue([]);

		await controller.getContacts(authSession);

		expect(userService.getContacts).toHaveBeenCalledWith({ userId: authSession.userId });
	});

	it("should add the contact to the authenticated user", async () => {
		const contact = { contactMethod: JobContactMethod.WHATSAPP, identifier: "@cataqui.poster" };
		const authSession = {
			expiresAt: new Date("2026-08-09T12:15:00.000Z"),
			sessionId: "3e73bbc6-09c8-4c78-87f4-a584a19bca21",
			userId: "f3f3f078-9332-4879-9904-6565abc5d88d",
		};
		userService.getOrAddContact.mockResolvedValue({
			contactId: "550e8400-e29b-41d4-a716-446655440000",
			...contact,
		});

		await controller.addContact(contact, authSession);

		expect(userService.getOrAddContact).toHaveBeenCalledWith({ userId: authSession.userId, contact: contact });
	});
});
