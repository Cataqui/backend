import { GUARDS_METADATA, HEADERS_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { Test } from "@nestjs/testing";
import { AccessTokenGuard } from "../auth/guards/access-token.guard";
import { ContactService } from "../contact/contact.service";
import { JobService } from "../job/job.service";
import { UserController } from "./user.controller";
import { UserService } from "./user.service";

describe("UserController", () => {
	let controller: UserController;
	let userService: { getCurrentUser: ReturnType<typeof vi.fn> };
	let contactService: { getContacts: ReturnType<typeof vi.fn> };
	let jobService: { getUserJobs: ReturnType<typeof vi.fn> };

	beforeEach(async () => {
		userService = { getCurrentUser: vi.fn() };
		contactService = { getContacts: vi.fn() };
		jobService = { getUserJobs: vi.fn() };
		const module = await Test.createTestingModule({
			controllers: [UserController],
			providers: [
				{ provide: UserService, useValue: userService },
				{ provide: ContactService, useValue: contactService },
				{ provide: JobService, useValue: jobService },
			],
		})
			.overrideGuard(AccessTokenGuard)
			.useValue({ canActivate: vi.fn() })
			.compile();
		controller = module.get(UserController);
	});

	it("should expose user-owned contacts below the users resource", () => {
		expect(Reflect.getMetadata(PATH_METADATA, UserController)).toBe("users");
	});

	it("should require an access token before reading saved contacts", () => {
		expect(Reflect.getMetadata(GUARDS_METADATA, controller.getContacts)).toEqual([AccessTokenGuard]);
	});

	it("should require an access token and avoid caching the current user", () => {
		expect({
			guards: Reflect.getMetadata(GUARDS_METADATA, controller.getCurrentUser),
			headers: Reflect.getMetadata(HEADERS_METADATA, controller.getCurrentUser),
		}).toEqual({
			guards: [AccessTokenGuard],
			headers: [{ name: "Cache-Control", value: "no-store" }],
		});
	});

	it("should request the current user using the authenticated session", async () => {
		const authSession = { sessionId: "session-id", userId: "user-id", expiresAt: new Date() };
		userService.getCurrentUser.mockResolvedValue({ userId: "user-id", displayIdentifier: "Ana Silva" });

		const result = await controller.getCurrentUser(authSession);

		expect({ result: result, params: userService.getCurrentUser.mock.calls[0]?.[0] }).toEqual({
			result: { userId: "user-id", displayIdentifier: "Ana Silva" },
			params: { sessionId: "session-id", userId: "user-id" },
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
		contactService.getContacts.mockResolvedValue([]);

		await controller.getContacts(authSession);

		expect(contactService.getContacts).toHaveBeenCalledWith({ userId: authSession.userId });
	});

	it("does not expose a separate saved-contact creation action", () => {
		expect(controller).not.toHaveProperty("addContact");
	});
	it("requires an access token and isolates posted jobs by session user", async () => {
		const session = { sessionId: "session", userId: "poster", expiresAt: new Date() };
		jobService.getUserJobs.mockResolvedValue({ data: [], pagination: { hasMore: false, nextCursor: null } });
		await controller.getUserJobs({}, session);
		expect(Reflect.getMetadata(GUARDS_METADATA, controller.getUserJobs)).toEqual([AccessTokenGuard]);
		expect(jobService.getUserJobs).toHaveBeenCalledWith({ posterUserId: "poster", cursor: undefined });
	});
});
