import { ApiWorkerPortal } from "@cataqui/api-workerhole";
import type { AuthenticatedSession } from "@cataqui/auth-schemas";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { getStorageToken, ThrottlerStorageService } from "@nestjs/throttler";
import * as td from "testdouble";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/core/app.factory";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { AccountMetadataRepository } from "../src/modules/me/repositories/account-metadata.repository";
import { ProfileService } from "../src/modules/profile/profile.service";
import type { OpenAPIObject } from "@nestjs/swagger";
import { ErrorCode } from "../src/core/errors/error-code.enum";
import type { AccountMetadata } from "../generated/prisma/client";

const session = {
	accountId: "00000000-0000-4000-8000-000000000001",
	sessionId: "00000000-0000-4000-8000-000000000002",
	expiresAt: "2026-10-22T20:00:00.000Z",
} satisfies AuthenticatedSession;
const headers = { "x-cataqui-auth-session": JSON.stringify(session) };

describe("Current user metadata", () => {
	let app: NestFastifyApplication;
	let repository: AccountMetadataRepository;
	let profileService: ProfileService;

	beforeEach(async () => {
		repository = td.object<AccountMetadataRepository>();
		profileService = td.object<ProfileService>();
		const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
			.overrideProvider(ApiWorkerPortal)
			.useValue(td.object<ApiWorkerPortal>())
			.overrideProvider(PrismaService)
			.useValue(td.object<PrismaService>())
			.overrideProvider(getStorageToken())
			.useValue(new ThrottlerStorageService())
			.overrideProvider(AccountMetadataRepository)
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

	it.each(["GET", "PATCH"] as const)("requires authentication for %s metadata", async (method) => {
		const response = await app.inject({
			method: method,
			url: "/v1/me/metadata",
		});
		expect({
			status: response.statusCode,
			code: response.json<{ errorCode: string }>().errorCode,
			reads: td.explain(repository.findByAccountId).callCount,
			writes: td.explain(repository.upsert).callCount,
		}).toEqual({ status: 401, code: "ACCESS_TOKEN_REQUIRED", reads: 0, writes: 0 });
	});

	it("returns default metadata in the success envelope without requiring a profile or writing", async () => {
		td.when(repository.findByAccountId({ accountId: session.accountId })).thenResolve(null);
		const response = await app.inject({ method: "GET", url: "/v1/me/metadata", headers: headers });
		expect({
			status: response.statusCode,
			cache: response.headers["cache-control"],
			body: response.json(),
			profileChecks: td.explain(profileService.requireExists).callCount,
			writes: td.explain(repository.upsert).callCount,
		}).toEqual({
			status: 200,
			cache: "no-store",
			body: {
				data: { onboardingCompleted: false },
				requestId: expect.any(String),
				timestamp: expect.any(String),
				endpoint: "/v1/me/metadata",
			},
			profileChecks: 0,
			writes: 0,
		});
	});

	it.each([true, false])("returns persisted onboardingCompleted=%s", async (completed) => {
		td.when(repository.findByAccountId({ accountId: session.accountId })).thenResolve({
			accountId: session.accountId,
			onboardingCompleted: completed,
		});
		const response = await app.inject({ method: "GET", url: "/v1/me/metadata", headers: headers });
		expect({ status: response.statusCode, data: response.json<{ data: unknown }>().data }).toEqual({
			status: 200,
			data: { onboardingCompleted: completed },
		});
	});

	it.each([true, false])("patches onboardingCompleted=%s without requiring a profile", async (completed) => {
		td.when(repository.upsert({ accountId: session.accountId, onboardingCompleted: completed })).thenResolve({
			accountId: session.accountId,
			onboardingCompleted: completed,
		});
		const response = await app.inject({
			method: "PATCH",
			url: "/v1/me/metadata",
			headers: headers,
			payload: { onboardingCompleted: completed },
		});
		expect({
			status: response.statusCode,
			cache: response.headers["cache-control"],
			body: response.json(),
			profileChecks: td.explain(profileService.requireExists).callCount,
		}).toEqual({
			status: 200,
			cache: "no-store",
			body: {
				data: { onboardingCompleted: completed },
				requestId: expect.any(String),
				timestamp: expect.any(String),
				endpoint: "/v1/me/metadata",
			},
			profileChecks: 0,
		});
	});

	it.each([null, { accountId: session.accountId, onboardingCompleted: true }])(
		"returns unchanged metadata for an empty patch: %j",
		async (metadata) => {
			td.when(repository.findByAccountId({ accountId: session.accountId })).thenResolve(metadata);
			const response = await app.inject({ method: "PATCH", url: "/v1/me/metadata", headers: headers, payload: {} });
			expect({
				status: response.statusCode,
				data: response.json<{ data: unknown }>().data,
				writes: td.explain(repository.upsert).callCount,
			}).toEqual({ status: 200, data: { onboardingCompleted: metadata?.onboardingCompleted ?? false }, writes: 0 });
		},
	);

	it.each([
		{ onboardingCompleted: null },
		{ onboardingCompleted: "true" },
		{ onboardingCompleted: 1 },
		{ onboardingCompleted: true, accountId: "other" },
		[],
	])("rejects invalid patches before storage: %j", async (payload) => {
		const response = await app.inject({ method: "PATCH", url: "/v1/me/metadata", headers: headers, payload: payload });
		expect({
			status: response.statusCode,
			body: response.json(),
			writes: td.explain(repository.upsert).callCount,
		}).toMatchObject({
			status: 400,
			body: { status: 400, errorCode: ErrorCode.VALIDATION_ERROR, violations: expect.any(Array) },
			writes: 0,
		});
	});

	it("keeps repeated completion, resets, and reads isolated between accounts", async () => {
		const records = new Map<string, AccountMetadata>();
		td.when(repository.findByAccountId(td.matchers.anything())).thenDo(
			async (params: { accountId: string }): Promise<AccountMetadata | null> => records.get(params.accountId) ?? null,
		);
		td.when(repository.upsert(td.matchers.anything())).thenDo(
			async (params: AccountMetadata): Promise<AccountMetadata> => {
				records.set(params.accountId, params);
				return params;
			},
		);
		const otherSession = {
			...session,
			accountId: "00000000-0000-4000-8000-000000000003",
		} satisfies AuthenticatedSession;
		const results: unknown[] = [];
		for (const completed of [true, true, false]) {
			const response = await app.inject({
				method: "PATCH",
				url: "/v1/me/metadata",
				headers: headers,
				payload: { onboardingCompleted: completed },
			});
			results.push({ status: response.statusCode, data: response.json<{ data: unknown }>().data });
		}
		const otherResponse = await app.inject({
			method: "GET",
			url: "/v1/me/metadata",
			headers: { "x-cataqui-auth-session": JSON.stringify(otherSession) },
		});
		expect({
			results: results,
			other: otherResponse.json<{ data: unknown }>().data,
			records: [...records.values()],
		}).toEqual({
			results: [true, true, false].map((completed) => ({ status: 200, data: { onboardingCompleted: completed } })),
			other: { onboardingCompleted: false },
			records: [{ accountId: session.accountId, onboardingCompleted: false }],
		});
	});

	it("documents authenticated GET and PATCH contracts using the shared metadata response", async () => {
		const response = await app.inject({ method: "GET", url: "/docs-json" });
		const document = response.json<OpenAPIObject>();
		expect({ path: document?.paths["/v1/me/metadata"], schemas: document?.components?.schemas }).toMatchObject({
			path: {
				get: {
					security: [{ bearer: [] }],
					responses: {
						"200": {
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/AccountMetadataOutputSuccessResponse" } },
							},
						},
						default: expect.any(Object),
					},
				},
				patch: {
					security: [{ bearer: [] }],
					requestBody: {
						content: { "application/json": { schema: { $ref: "#/components/schemas/UpdateAccountMetadataInput" } } },
					},
					responses: {
						"200": {
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/AccountMetadataOutputSuccessResponse" } },
							},
						},
						default: expect.any(Object),
					},
				},
			},
			schemas: {
				AccountMetadataOutput: {
					additionalProperties: false,
					required: ["onboardingCompleted"],
					properties: { onboardingCompleted: { type: "boolean" } },
				},
				UpdateAccountMetadataInput: {
					additionalProperties: false,
					properties: { onboardingCompleted: { type: "boolean" } },
				},
			},
		});
	});
});
