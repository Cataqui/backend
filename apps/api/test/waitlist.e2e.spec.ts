import { AccountService } from "../src/modules/account/account.service";
import { InviteService } from "../src/modules/invite/invite.service";
import { ApiWorkerPortal } from "@cataqui/api-workerhole";
import type { AuthenticatedSession } from "@cataqui/auth-schemas";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import type { OpenAPIObject } from "@nestjs/swagger";
import { Test } from "@nestjs/testing";
import { getStorageToken, ThrottlerStorageService } from "@nestjs/throttler";
import * as td from "testdouble";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/core/app.factory";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { AccountAdmission } from "../generated/prisma/enums";
import { AccountRepository } from "../src/modules/account/repositories/account.repository";
import { ProfileRepository } from "../src/modules/profile/repositories/profile.repository";
import type { InviteRepository } from "../src/modules/invite/repositories/invite.repository";
import { WaitlistUnitOfWork } from "../src/modules/waitlist/waitlist.unit-of-work";

const session = {
	accountId: "00000000-0000-4000-8000-000000000001",
	sessionId: "00000000-0000-4000-8000-000000000002",
	expiresAt: "2026-10-29T23:00:00.000Z",
} satisfies AuthenticatedSession;
const headers = { "x-cataqui-auth-session": JSON.stringify(session) };

describe("Waitlist and independent profile HTTP contracts", () => {
	let app: NestFastifyApplication;
	let accountRepository: AccountRepository;
	let inviteRepository: InviteRepository;
	let profileRepository: ProfileRepository;
	let unitOfWork: WaitlistUnitOfWork;
	beforeEach(async () => {
		accountRepository = td.object<AccountRepository>();
		inviteRepository = td.object<InviteRepository>();
		profileRepository = td.object<ProfileRepository>();
		unitOfWork = td.object<WaitlistUnitOfWork>();
		td.when(unitOfWork.execute(td.matchers.anything())).thenDo(
			async (operation: Parameters<WaitlistUnitOfWork["execute"]>[0]): Promise<unknown> =>
				operation({
					accountService: new AccountService(accountRepository),
					inviteService: new InviteService(inviteRepository),
				}),
		);
		const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
			.overrideProvider(ApiWorkerPortal)
			.useValue(td.object<ApiWorkerPortal>())
			.overrideProvider(PrismaService)
			.useValue(td.object<PrismaService>())
			.overrideProvider(getStorageToken())
			.useValue(new ThrottlerStorageService())
			.overrideProvider(WaitlistUnitOfWork)
			.useValue(unitOfWork)
			.overrideProvider(AccountRepository)
			.useValue(accountRepository)
			.overrideProvider(ProfileRepository)
			.useValue(profileRepository)
			.compile();
		app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
		await configureApp(app);
		await app.init();
	});
	afterEach(async () => {
		await app.close();
		td.reset();
	});

	it.each(["/v1/waitlist/join", "/v1/waitlist/skip", "/v1/profiles"])(
		"requires authentication before storage at %s",
		async (url) => {
			const response = await app.inject({ method: "POST", url: url, payload: { inviteCode: "CODE" } });
			expect({
				status: response.statusCode,
				code: response.json<{ errorCode: string }>().errorCode,
				transactions: td.explain(unitOfWork.execute).callCount,
				profiles: td.explain(profileRepository.createWithContacts).callCount,
			}).toEqual({ status: 401, code: "ACCESS_TOKEN_REQUIRED", transactions: 0, profiles: 0 });
		},
	);
	it("does not expose the former redeem route", async () => {
		const response = await app.inject({
			method: "POST",
			url: "/v1/waitlist/redeem",
			headers: headers,
			payload: { inviteCode: "CODE" },
		});
		expect({ status: response.statusCode, transactions: td.explain(unitOfWork.execute).callCount }).toEqual({
			status: 404,
			transactions: 0,
		});
	});
	it.each([AccountAdmission.NOT_REQUESTED, AccountAdmission.WAITLISTED])(
		"joins without a profile or response body from %s",
		async (admission) => {
			td.when(accountRepository.getOrCreate({ accountId: session.accountId })).thenResolve({
				id: session.accountId,
				admission: admission,
				fromInviteId: null,
				onboardingCompleted: false,
			});
			const response = await app.inject({ method: "POST", url: "/v1/waitlist/join", headers: headers });
			expect({
				status: response.statusCode,
				cache: response.headers["cache-control"],
				body: response.body,
				writes: td.explain(accountRepository.updateAdmission).calls.map((call) => call.args),
				profileLookups: td.explain(profileRepository.findById).callCount,
			}).toEqual({
				status: 204,
				cache: "no-store",
				body: "",
				writes:
					admission === AccountAdmission.NOT_REQUESTED
						? [[{ accountId: session.accountId, admission: AccountAdmission.WAITLISTED }]]
						: [],
				profileLookups: 0,
			});
		},
	);
	it.each([null, "recorded-invite"])(
		"rejects joining an admitted account with attribution %s",
		async (fromInviteId) => {
			td.when(accountRepository.getOrCreate({ accountId: session.accountId })).thenResolve({
				id: session.accountId,
				admission: AccountAdmission.ADMITTED,
				fromInviteId: fromInviteId,
				onboardingCompleted: true,
			});
			const response = await app.inject({ method: "POST", url: "/v1/waitlist/join", headers: headers });
			expect({
				status: response.statusCode,
				body: response.json(),
				writes: td.explain(accountRepository.updateAdmission).callCount,
				attributionWrites: td.explain(accountRepository.setFromInviteIfEmpty).callCount,
			}).toEqual({
				status: 409,
				body: {
					status: 409,
					errorCode: "ACCOUNT_ALREADY_ADMITTED",
					message: "The account is already admitted and cannot join the waitlist.",
					requestId: expect.any(String),
					timestamp: expect.any(String),
					endpoint: "/v1/waitlist/join",
				},
				writes: 0,
				attributionWrites: 0,
			});
		},
	);
	it.each([AccountAdmission.NOT_REQUESTED, AccountAdmission.WAITLISTED])(
		"normalizes a code and admits only the authenticated account from %s with no response body",
		async (admission) => {
			td.when(accountRepository.setFromInviteIfEmpty({ accountId: session.accountId, inviteId: "invite" })).thenResolve(
				true,
			);
			td.when(accountRepository.getOrCreate({ accountId: session.accountId })).thenResolve({
				id: session.accountId,
				admission: admission,
				fromInviteId: null,
				onboardingCompleted: false,
			});
			td.when(inviteRepository.findAndLockByCode({ code: "RYAN-2026" })).thenResolve({
				id: "invite",
				enabled: true,
				maxUses: 1,
				uses: 0,
			});
			const response = await app.inject({
				method: "POST",
				url: "/v1/waitlist/skip",
				headers: headers,
				payload: { inviteCode: " ryan-2026 " },
			});
			expect({
				status: response.statusCode,
				body: response.body,
				cache: response.headers["cache-control"],
				writes: td.explain(accountRepository.updateAdmission).calls.map((call) => call.args),
				attributionWrites: td.explain(accountRepository.setFromInviteIfEmpty).calls.map((call) => call.args),
			}).toEqual({
				status: 204,
				body: "",
				cache: "no-store",
				writes: [[{ accountId: session.accountId, admission: AccountAdmission.ADMITTED }]],
				attributionWrites: [[{ accountId: session.accountId, inviteId: "invite" }]],
			});
		},
	);
	it.each(
		[AccountAdmission.NOT_REQUESTED, AccountAdmission.WAITLISTED].flatMap((admission) =>
			["unknown", "disabled", "exhausted"].map((state) => ({ admission: admission, state: state })),
		),
	)("returns INVITE_UNAVAILABLE for $state invites from $admission", async ({ admission, state }) => {
		td.when(accountRepository.getOrCreate({ accountId: session.accountId })).thenResolve({
			id: session.accountId,
			admission: admission,
			fromInviteId: null,
			onboardingCompleted: false,
		});
		td.when(inviteRepository.findAndLockByCode({ code: "CODE" })).thenResolve(
			state === "unknown"
				? null
				: { id: "invite", enabled: state !== "disabled", maxUses: 1, uses: state === "exhausted" ? 1 : 0 },
		);
		const response = await app.inject({
			method: "POST",
			url: "/v1/waitlist/skip",
			headers: headers,
			payload: { inviteCode: "CODE" },
		});
		expect({
			status: response.statusCode,
			code: response.json<{ errorCode: string }>().errorCode,
			writes: td.explain(accountRepository.updateAdmission).callCount,
			attributionWrites: td.explain(accountRepository.setFromInviteIfEmpty).callCount,
		}).toEqual({ status: 422, code: "INVITE_UNAVAILABLE", writes: 0, attributionWrites: 0 });
	});

	it.each([null, "recorded-invite"])(
		"returns bodyless success for admitted accounts with attribution %s",
		async (fromInviteId) => {
			td.when(accountRepository.getOrCreate({ accountId: session.accountId })).thenResolve({
				id: session.accountId,
				admission: AccountAdmission.ADMITTED,
				fromInviteId: fromInviteId,
				onboardingCompleted: false,
			});
			const response = await app.inject({
				method: "POST",
				url: "/v1/waitlist/skip",
				headers: headers,
				payload: { inviteCode: "OTHER-CODE" },
			});
			expect({
				status: response.statusCode,
				body: response.body,
				cache: response.headers["cache-control"],
				reads: td.explain(inviteRepository.findAndLockByCode).callCount,
				writes: td.explain(accountRepository.updateAdmission).callCount,
				attributionWrites: td.explain(accountRepository.setFromInviteIfEmpty).callCount,
			}).toEqual({ status: 204, body: "", cache: "no-store", reads: 0, writes: 0, attributionWrites: 0 });
		},
	);
	it("rejects changing established attribution without admitting the account", async () => {
		td.when(accountRepository.getOrCreate({ accountId: session.accountId })).thenResolve({
			id: session.accountId,
			admission: AccountAdmission.WAITLISTED,
			fromInviteId: "original",
			onboardingCompleted: false,
		});
		td.when(inviteRepository.findAndLockByCode({ code: "CODE" })).thenResolve({
			id: "replacement",
			enabled: true,
			maxUses: null,
			uses: 0,
		});
		td.when(
			accountRepository.setFromInviteIfEmpty({ accountId: session.accountId, inviteId: "replacement" }),
		).thenResolve(false);
		const response = await app.inject({
			method: "POST",
			url: "/v1/waitlist/skip",
			headers: headers,
			payload: { inviteCode: "CODE" },
		});
		expect({
			status: response.statusCode,
			code: response.json<{ errorCode: string }>().errorCode,
			admissionWrites: td.explain(accountRepository.updateAdmission).callCount,
		}).toEqual({ status: 409, code: "ACCOUNT_INVITE_ALREADY_SET", admissionWrites: 0 });
	});
	it.each([
		{},
		{ inviteCode: "BAD_CODE" },
		{ inviteCode: "CODE", accountId: "other" },
		{ inviteCode: "CODE", admission: "ADMITTED" },
	])("rejects invalid or caller-selected waitlist skip fields %j", async (payload) => {
		const response = await app.inject({
			method: "POST",
			url: "/v1/waitlist/skip",
			headers: headers,
			payload: payload,
		});
		expect({ status: response.statusCode, transactions: td.explain(unitOfWork.execute).callCount }).toEqual({
			status: 400,
			transactions: 0,
		});
	});
	it.each(Object.values(AccountAdmission))("creates a profile independently of admission %s", async (admission) => {
		td.when(accountRepository.getOrCreate({ accountId: session.accountId })).thenResolve({
			id: session.accountId,
			admission: admission,
			onboardingCompleted: false,
			fromInviteId: null,
		});
		td.when(profileRepository.createWithContacts(td.matchers.anything())).thenDo(
			async (
				params: Parameters<ProfileRepository["createWithContacts"]>[0],
			): Promise<Awaited<ReturnType<ProfileRepository["createWithContacts"]>>> => ({
				insertion: { count: 1 },
				profile: {
					id: params.profileId,
					name: params.name,
					creationHash: params.creationHash,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			}),
		);
		const response = await app.inject({
			method: "POST",
			url: "/v1/profiles",
			headers: headers,
			payload: { name: "Maria", initialContacts: [] },
		});
		expect({
			status: response.statusCode,
			data: response.json<{ data: unknown }>().data,
			accountReads: td.explain(accountRepository.getOrCreate).callCount,
			admissionWrites: td.explain(accountRepository.updateAdmission).callCount,
		}).toEqual({
			status: 201,
			data: { profileId: session.accountId, name: "Maria" },
			accountReads: 0,
			admissionWrites: 0,
		});
	});
	it.each([1, 0])("preserves the profile response and retry status with insertion %s", async (count) => {
		td.when(accountRepository.getOrCreate({ accountId: session.accountId })).thenResolve({
			id: session.accountId,
			admission: AccountAdmission.ADMITTED,
			onboardingCompleted: false,
			fromInviteId: "invite",
		});
		td.when(profileRepository.createWithContacts(td.matchers.anything())).thenDo(
			async (
				params: Parameters<ProfileRepository["createWithContacts"]>[0],
			): Promise<Awaited<ReturnType<ProfileRepository["createWithContacts"]>>> => ({
				insertion: { count: count },
				profile: {
					id: params.profileId,
					name: params.name,
					creationHash: params.creationHash,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			}),
		);
		const response = await app.inject({
			method: "POST",
			url: "/v1/profiles",
			headers: headers,
			payload: { name: " Maria ", initialContacts: [] },
		});
		expect({
			status: response.statusCode,
			cache: response.headers["cache-control"],
			data: response.json<{ data: unknown }>().data,
			accountWrites: td.explain(accountRepository.updateAdmission).callCount,
		}).toEqual({
			status: count === 1 ? 201 : 200,
			cache: "no-store",
			data: { profileId: session.accountId, name: "Maria" },
			accountWrites: 0,
		});
	});
	it("rejects invite input during profile creation", async () => {
		const response = await app.inject({
			method: "POST",
			url: "/v1/profiles",
			headers: headers,
			payload: { name: "Maria", initialContacts: [], inviteCode: "CODE" },
		});
		expect({ status: response.statusCode, writes: td.explain(profileRepository.createWithContacts).callCount }).toEqual(
			{ status: 400, writes: 0 },
		);
	});
	it("documents bodyless waitlist commands without a profile admission prerequisite", async () => {
		const document = (await app.inject({ method: "GET", url: "/docs-json" })).json<OpenAPIObject>();
		expect({
			join: document.paths["/v1/waitlist/join"]?.post,
			skip: document.paths["/v1/waitlist/skip"]?.post,
			input: document.components?.schemas?.["SkipWaitlistInput"],
			profileInput: document.components?.schemas?.["CreateProfileInput"],
			profileForbidden: document.paths["/v1/profiles"]?.post?.responses?.["403"],
			skipForbidden: document.paths["/v1/waitlist/skip"]?.post?.responses?.["403"],
			formerRoute: document.paths["/v1/waitlist/redeem"],
			formerInput: document.components?.schemas?.["RedeemInviteCodeInput"],
		}).toMatchObject({
			join: {
				security: [{ bearer: [] }],
				responses: {
					"204": { description: expect.any(String) },
					"409": { description: expect.stringContaining("ACCOUNT_ALREADY_ADMITTED"), content: expect.any(Object) },
					default: expect.any(Object),
				},
			},
			skip: {
				security: [{ bearer: [] }],
				responses: {
					"204": { description: expect.any(String) },
					"409": { description: expect.stringContaining("ACCOUNT_INVITE_ALREADY_SET") },
					"422": { description: expect.stringContaining("INVITE_UNAVAILABLE") },
					default: expect.any(Object),
				},
			},
			input: {
				required: ["inviteCode"],
				properties: { inviteCode: { type: "string", maxLength: 64, pattern: "^[A-Za-z0-9-]+$" } },
			},
			profileInput: {
				properties: { name: expect.any(Object), initialContacts: expect.any(Object) },
				required: ["name", "initialContacts"],
			},
			profileForbidden: undefined,
			skipForbidden: undefined,
			formerRoute: undefined,
			formerInput: undefined,
		});
	});
});
