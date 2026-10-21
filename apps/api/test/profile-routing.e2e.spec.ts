import { ApiWorkerPortal } from "@cataqui/api-workerhole";
import type { AuthenticatedSession } from "@cataqui/auth-schemas";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { getStorageToken, ThrottlerStorageService } from "@nestjs/throttler";
import * as td from "testdouble";
import type { z } from "zod";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/core/app.factory";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { ContactService } from "../src/modules/contact/contact.service";
import { JobService } from "../src/modules/job/job.service";
import type { CreateJobInputSchema } from "../src/modules/job/schemas/create-job-input.schema";
import type { PublicJobOutputSchema } from "../src/modules/job/schemas/public-job-output.schema";
import { ProfileRequiredError } from "../src/modules/profile/errors/profile-required.error";
import { ProfileNotFoundError } from "../src/modules/profile/errors/profile-not-found.error";
import { ProfileService } from "../src/modules/profile/profile.service";
import { PaginatedResult } from "../src/shared/results/paginated-result";

afterEach(() => td.reset());

const session = {
	accountId: "00000000-0000-4000-8000-000000000001",
	sessionId: "00000000-0000-4000-8000-000000000002",
	expiresAt: "2026-10-19T15:00:00.000Z",
} satisfies AuthenticatedSession;
const headers = { "x-cataqui-auth-session": JSON.stringify(session) };
const profile = { profileId: session.accountId, name: "Maria" } satisfies Awaited<
	ReturnType<ProfileService["getCurrent"]>
>;
const jobId = "00000000-0000-4000-8000-000000000003";
const location = {
	latitude: -23.55,
	longitude: -46.63,
	areaRadius: 100,
	imageUrl: "https://example.com/map.webp",
} satisfies z.infer<typeof PublicJobOutputSchema>["location"];
const input = {
	description: "Preciso de ajuda para descarregar caixas.",
	location: { title: "Centro", latitude: -23.55, longitude: -46.63 },
	contact: { method: "WHATSAPP", identifier: "+5511999999999" },
} satisfies z.infer<typeof CreateJobInputSchema>;
const job = {
	jobId: jobId,
	title: "Descarregar caixas",
	description: input.description,
	descriptionSummary: "Ajuda com caixas",
	payment: null,
	contactReference: { contactId: "00000000-0000-4000-8000-000000000004", method: "WHATSAPP" },
	location: location,
	status: "ACTIVE",
	createdAt: "2026-10-19T15:00:00.000Z",
	updatedAt: "2026-10-19T15:00:00.000Z",
} satisfies z.infer<typeof PublicJobOutputSchema>;

async function _buildApp(): Promise<{
	app: NestFastifyApplication;
	profileService: ProfileService;
	jobService: JobService;
	contactService: ContactService;
}> {
	const profileService = td.object<ProfileService>();
	const jobService = td.object<JobService>();
	const contactService = td.object<ContactService>();
	const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
		.overrideProvider(ApiWorkerPortal)
		.useValue(td.object<ApiWorkerPortal>())
		.overrideProvider(PrismaService)
		.useValue(td.object<PrismaService>())
		.overrideProvider(getStorageToken())
		.useValue(new ThrottlerStorageService())
		.overrideProvider(ProfileService)
		.useValue(profileService)
		.overrideProvider(JobService)
		.useValue(jobService)
		.overrideProvider(ContactService)
		.useValue(contactService)
		.compile();
	const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
	await configureApp(app);
	await app.init();
	return { app: app, profileService: profileService, jobService: jobService, contactService: contactService };
}

describe("Profile routing and prerequisites", () => {
	it.each([
		{ method: "POST", url: "/v1/profiles" },
		{ method: "GET", url: "/v1/profiles/me" },
		{ method: "GET", url: "/v1/profiles/me/contacts" },
		{ method: "GET", url: "/v1/profiles/me/jobs" },
		{ method: "GET", url: `/v1/profiles/me/jobs/${jobId}` },
	] as const)("requires authentication for $method $url", async ({ method, url }) => {
		const { app, profileService } = await _buildApp();
		try {
			const response = await app.inject({ method: method, url: url });
			expect(response.statusCode).toBe(401);
			expect(td.explain(profileService.requireExists).callCount).toBe(0);
		} finally {
			await app.close();
		}
	});

	it("authenticates before checking the posting prerequisite", async () => {
		const { app, profileService, jobService } = await _buildApp();
		try {
			const response = await app.inject({ method: "POST", url: "/v1/jobs", payload: {} });
			expect({ status: response.statusCode, code: response.json<{ errorCode: string }>().errorCode }).toEqual({
				status: 401,
				code: "ACCESS_TOKEN_REQUIRED",
			});
			expect(td.explain(profileService.requireExists).callCount).toBe(0);
			expect(td.explain(jobService.createJob).callCount).toBe(0);
		} finally {
			await app.close();
		}
	});

	it("blocks job preparation when the authenticated account has no profile", async () => {
		const { app, profileService, jobService } = await _buildApp();
		td.when(profileService.requireExists({ profileId: session.accountId })).thenReject(new ProfileRequiredError());
		try {
			const response = await app.inject({ method: "POST", url: "/v1/jobs", headers: headers, payload: {} });
			expect({ status: response.statusCode, code: response.json<{ errorCode: string }>().errorCode }).toEqual({
				status: 409,
				code: "PROFILE_REQUIRED",
			});
			expect(td.explain(profileService.requireExists).callCount).toBe(1);
			expect(td.explain(jobService.createJob).callCount).toBe(0);
		} finally {
			await app.close();
		}
	});

	it("checks once and forwards a permitted job creation", async () => {
		const { app, profileService, jobService } = await _buildApp();
		td.when(jobService.createJob(td.matchers.anything())).thenResolve(job);
		try {
			const response = await app.inject({
				method: "POST",
				url: "/v1/jobs",
				headers: { ...headers, "idempotency-key": jobId },
				payload: input,
			});
			expect(response.statusCode).toBe(201);
			expect(td.explain(profileService.requireExists).calls.map((call) => call.args)).toEqual([
				[{ profileId: session.accountId }],
			]);
			expect(td.explain(jobService.createJob).calls.map((call) => call.args)).toEqual([
				[{ dto: input, idempotencyKey: jobId, posterProfileId: session.accountId }],
			]);
		} finally {
			await app.close();
		}
	});

	it.each([true, false])("creates or retries a profile without requiring one first: created=%s", async (created) => {
		const { app, profileService } = await _buildApp();
		td.when(profileService.create(td.matchers.anything())).thenResolve({ created: created, profile: profile });
		try {
			const payload = { name: "Maria", initialContacts: [] } satisfies Parameters<ProfileService["create"]>[0]["input"];
			const response = await app.inject({ method: "POST", url: "/v1/profiles", headers: headers, payload: payload });
			expect(response.statusCode).toBe(created ? 201 : 200);
			expect(td.explain(profileService.requireExists).callCount).toBe(0);
			expect(td.explain(profileService.create).calls.map((call) => call.args)).toEqual([
				[{ profileId: session.accountId, input: payload }],
			]);
		} finally {
			await app.close();
		}
	});

	it("serves the current profile, contacts and scoped jobs without a prerequisite lookup", async () => {
		const { app, profileService, jobService, contactService } = await _buildApp();
		td.when(profileService.getCurrent({ profileId: session.accountId })).thenResolve(profile);
		td.when(contactService.getContacts({ ownerProfileId: session.accountId })).thenResolve([]);
		const page = PaginatedResult.create<Awaited<ReturnType<JobService["getProfileJobs"]>>["data"][number]>({
			data: [],
			pagination: { hasMore: false, nextCursor: null },
		});
		td.when(jobService.getProfileJobs(td.matchers.anything())).thenResolve(page);
		const detail = {
			jobId: jobId,
			description: input.description,
			contact: null,
			location: { title: "Centro", ...location },
			status: "ACTIVE",
			createdAt: job.createdAt,
			updatedAt: job.updatedAt,
		} satisfies Awaited<ReturnType<JobService["getProfileJob"]>>;
		td.when(jobService.getProfileJob(td.matchers.anything())).thenResolve(detail);
		try {
			for (const url of [
				"/v1/profiles/me",
				"/v1/profiles/me/contacts",
				"/v1/profiles/me/jobs?cursor=cursor",
				`/v1/profiles/me/jobs/${jobId}`,
			]) {
				const response = await app.inject({ method: "GET", url: url, headers: headers });
				expect(response.statusCode, url).toBe(200);
			}
			expect(td.explain(profileService.requireExists).callCount).toBe(0);
			expect(td.explain(jobService.getProfileJobs).calls.map((call) => call.args)).toEqual([
				[{ posterProfileId: session.accountId, cursor: "cursor" }],
			]);
			expect(td.explain(jobService.getProfileJob).calls.map((call) => call.args)).toEqual([
				[{ posterProfileId: session.accountId, jobId: jobId }],
			]);
		} finally {
			await app.close();
		}
	});

	it("preserves the missing-profile response on the current-profile read", async () => {
		const { app, profileService } = await _buildApp();
		td.when(profileService.getCurrent({ profileId: session.accountId })).thenReject(new ProfileNotFoundError());
		try {
			const response = await app.inject({ method: "GET", url: "/v1/profiles/me", headers: headers });
			expect({ status: response.statusCode, code: response.json<{ errorCode: string }>().errorCode }).toEqual({
				status: 404,
				code: "PROFILE_NOT_FOUND",
			});
			expect(td.explain(profileService.requireExists).callCount).toBe(0);
		} finally {
			await app.close();
		}
	});

	it("keeps public health outside both requirements", async () => {
		const { app, profileService } = await _buildApp();
		try {
			const response = await app.inject({ method: "GET", url: "/v1/health/live" });
			expect(response.statusCode).toBe(204);
			expect(td.explain(profileService.requireExists).callCount).toBe(0);
		} finally {
			await app.close();
		}
	});

	it.each([
		"/v1/profile",
		"/v1/profile/contacts",
		"/v1/profile/jobs",
		`/v1/profile/jobs/${jobId}`,
		`/v1/profiles/${session.accountId}`,
	])("does not register %s", async (url) => {
		const { app } = await _buildApp();
		try {
			const response = await app.inject({ method: "GET", url: url, headers: headers });
			expect(response.statusCode).toBe(404);
			if (url === "/v1/profile")
				expect(
					(
						await app.inject({
							method: "POST",
							url: url,
							headers: headers,
							payload: { name: "Maria", initialContacts: [] },
						})
					).statusCode,
				).toBe(404);
		} finally {
			await app.close();
		}
	});
});
