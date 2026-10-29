import { ApiWorkerPortal } from "@cataqui/api-workerhole";
import type { AuthenticatedSession } from "@cataqui/auth-schemas";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { getStorageToken, ThrottlerStorageService } from "@nestjs/throttler";
import * as td from "testdouble";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/core/app.factory";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { AccountRepository } from "../src/modules/account/repositories/account.repository";
import { ProfileService } from "../src/modules/profile/profile.service";
import type { OpenAPIObject } from "@nestjs/swagger";
import { AccountAdmission } from "../generated/prisma/enums";
import type { Account } from "../generated/prisma/client";

const session = {
	accountId: "00000000-0000-4000-8000-000000000001",
	sessionId: "00000000-0000-4000-8000-000000000002",
	expiresAt: "2026-10-22T20:00:00.000Z",
} satisfies AuthenticatedSession;
const headers = { "x-cataqui-auth-session": JSON.stringify(session) };

describe("Current account", () => {
	let app: NestFastifyApplication;
	let repository: AccountRepository;
	let profileService: ProfileService;

	beforeEach(async () => {
		repository = td.object<AccountRepository>();
		profileService = td.object<ProfileService>();
		const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
			.overrideProvider(ApiWorkerPortal)
			.useValue(td.object<ApiWorkerPortal>())
			.overrideProvider(PrismaService)
			.useValue(td.object<PrismaService>())
			.overrideProvider(getStorageToken())
			.useValue(new ThrottlerStorageService())
			.overrideProvider(AccountRepository)
			.useValue(repository)
			.overrideProvider(ProfileService)
			.useValue(profileService)
			.compile();
		app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
		await configureApp(app);
		await app.init();
	});

	afterEach(async () => {
		await app.close();
		td.reset();
	});

	it.each([
		{ method: "GET", url: "/v1/account" },
		{ method: "POST", url: "/v1/account/complete-onboarding" },
	] as const)("requires authentication for $method $url", async (request) => {
		const response = await app.inject(request);
		expect({
			status: response.statusCode,
			code: response.json<{ errorCode: string }>().errorCode,
			reads: td.explain(repository.getOrCreate).callCount,
			writes: td.explain(repository.completeOnboarding).callCount,
		}).toEqual({ status: 401, code: "ACCESS_TOKEN_REQUIRED", reads: 0, writes: 0 });
	});

	it.each(Object.values(AccountAdmission))(
		"returns the full account with admission %s without requiring a profile",
		async (admission) => {
			const account = { id: session.accountId, admission: admission, onboardingCompleted: false } satisfies Account;
			td.when(repository.getOrCreate({ accountId: session.accountId })).thenResolve(account);
			const response = await app.inject({ method: "GET", url: "/v1/account", headers: headers });
			expect({
				status: response.statusCode,
				cache: response.headers["cache-control"],
				body: response.json(),
				profileChecks: td.explain(profileService.requireExists).callCount,
			}).toEqual({
				status: 200,
				cache: "no-store",
				body: { data: account, requestId: expect.any(String), timestamp: expect.any(String), endpoint: "/v1/account" },
				profileChecks: 0,
			});
		},
	);

	it("completes onboarding without a profile or response body", async () => {
		td.when(repository.completeOnboarding({ accountId: session.accountId })).thenResolve(undefined);
		const response = await app.inject({ method: "POST", url: "/v1/account/complete-onboarding", headers: headers });
		expect({
			status: response.statusCode,
			body: response.body,
			cache: response.headers["cache-control"],
			calls: td.explain(repository.completeOnboarding).calls.map((call) => call.args),
			profileChecks: td.explain(profileService.requireExists).callCount,
		}).toEqual({
			status: 204,
			body: "",
			cache: "no-store",
			calls: [[{ accountId: session.accountId }]],
			profileChecks: 0,
		});
	});

	it("does not allow completion payloads to choose another account, reset onboarding, or set admission", async () => {
		td.when(repository.completeOnboarding({ accountId: session.accountId })).thenResolve(undefined);
		const response = await app.inject({
			method: "POST",
			url: "/v1/account/complete-onboarding",
			headers: headers,
			payload: { id: "other", admission: AccountAdmission.ADMITTED, onboardingCompleted: false },
		});
		expect({
			status: response.statusCode,
			calls: td.explain(repository.completeOnboarding).calls.map((call) => call.args),
		}).toEqual({
			status: 204,
			calls: [[{ accountId: session.accountId }]],
		});
	});

	it.each(["GET", "PATCH"] as const)("removes the legacy %s metadata endpoint", async (method) => {
		const response = await app.inject({ method: method, url: "/v1/me/metadata", headers: headers });
		expect(response.statusCode).toBe(404);
	});

	it("keeps requests scoped to the authenticated account", async () => {
		const otherId = "00000000-0000-4000-8000-000000000003";
		const otherAccount = {
			id: otherId,
			admission: AccountAdmission.WAITLISTED,
			onboardingCompleted: false,
		} satisfies Account;
		td.when(repository.getOrCreate({ accountId: otherId })).thenResolve(otherAccount);
		const response = await app.inject({
			method: "GET",
			url: "/v1/account",
			headers: {
				"x-cataqui-auth-session": JSON.stringify({ ...session, accountId: otherId } satisfies AuthenticatedSession),
			},
		});
		expect({
			data: response.json<{ data: unknown }>().data,
			calls: td.explain(repository.getOrCreate).calls.map((call) => call.args),
		}).toEqual({
			data: otherAccount,
			calls: [[{ accountId: otherId }]],
		});
	});

	it("documents the account response and bodyless completion command", async () => {
		const response = await app.inject({ method: "GET", url: "/docs-json" });
		const document = response.json<OpenAPIObject>();
		expect({
			get: document.paths["/v1/account"]?.get,
			complete: document.paths["/v1/account/complete-onboarding"]?.post,
			legacy: document.paths["/v1/me/metadata"],
			schema: document.components?.schemas?.["AccountOutput"],
		}).toMatchObject({
			get: {
				security: [{ bearer: [] }],
				responses: {
					"200": {
						content: {
							"application/json": { schema: { $ref: "#/components/schemas/AccountOutputSuccessResponse" } },
						},
					},
					default: expect.any(Object),
				},
			},
			complete: {
				security: [{ bearer: [] }],
				responses: { "204": { description: expect.any(String) }, default: expect.any(Object) },
			},
			legacy: undefined,
			schema: {
				additionalProperties: false,
				required: ["id", "admission", "onboardingCompleted"],
				properties: {
					id: { type: "string", format: "uuid" },
					admission: { type: "string", enum: Object.values(AccountAdmission) },
					onboardingCompleted: { type: "boolean" },
				},
			},
		});
	});
});
