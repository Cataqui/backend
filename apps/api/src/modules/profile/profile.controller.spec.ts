import type { AuthenticatedSession } from "@cataqui/auth-schemas";
import { HttpStatus } from "@nestjs/common";
import { HEADERS_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import type { FastifyReply } from "fastify";
import * as td from "testdouble";
import type { z } from "zod";
import type { JobService } from "../job/job.service";
import type { ContactService } from "../contact/contact.service";
import { ProfileController } from "./profile.controller";
import type { ProfileService } from "./profile.service";
import type { CreateProfileInputSchema } from "./schemas/create-profile-input.schema";
import type { ProfileOutputSchema } from "./schemas/profile-output.schema";

afterEach(() => td.reset());

describe("ProfileController", () => {
	let profileService: ProfileService;
	let contactService: ContactService;
	let jobService: JobService;
	let reply: FastifyReply;
	let controller: ProfileController;
	const session = {
		accountId: "f3f3f078-9332-4879-9904-6565abc5d88d",
		sessionId: "session",
		expiresAt: "2026-10-19T12:00:00.000Z",
	} satisfies AuthenticatedSession;

	beforeEach(() => {
		profileService = td.object<ProfileService>();
		contactService = td.object<ContactService>();
		jobService = td.object<JobService>();
		reply = td.object<FastifyReply>();
		controller = new ProfileController(profileService, contactService, jobService);
	});

	it("exposes the authenticated profile resource", () => {
		expect(Reflect.getMetadata(PATH_METADATA, ProfileController)).toBe("profiles");
	});
	it.each(["createProfile", "getCurrentProfile", "getContacts", "getProfileJobs", "getProfileJob"] as const)(
		"prevents caching %s",
		(method) => {
			expect(Reflect.getMetadata(HEADERS_METADATA, controller[method])).toEqual([
				{ name: "Cache-Control", value: "no-store" },
			]);
		},
	);
	it.each([
		{ created: true, status: HttpStatus.CREATED },
		{ created: false, status: HttpStatus.OK },
	])("returns $status when profile creation reports created=$created", async ({ created, status }) => {
		const input = { name: "Maria", initialContacts: [] } satisfies z.infer<typeof CreateProfileInputSchema>;
		const profile = { profileId: session.accountId, name: "Maria" } satisfies z.infer<typeof ProfileOutputSchema>;
		td.when(profileService.create(td.matchers.anything())).thenResolve({
			created: created,
			profile: profile,
		} satisfies Awaited<ReturnType<ProfileService["create"]>>);
		const result = await controller.createProfile(input, session, reply);
		expect({
			result: result,
			input: td.explain(profileService.create).calls.map((call) => call.args),
			status: td.explain(reply.code).calls.map((call) => call.args),
		}).toEqual({ result: profile, input: [[{ profileId: session.accountId, input: input }]], status: [[status]] });
	});
	it("reads the profile owned by the authenticated account", async () => {
		const profile = { profileId: session.accountId, name: "Maria" } satisfies z.infer<typeof ProfileOutputSchema>;
		td.when(profileService.getCurrent({ profileId: session.accountId })).thenResolve(profile);
		const result = await controller.getCurrentProfile(session);
		expect({ result: result, input: td.explain(profileService.getCurrent).calls.map((call) => call.args) }).toEqual({
			result: profile,
			input: [[{ profileId: session.accountId }]],
		});
	});
	it("reads saved contacts owned by the authenticated account", async () => {
		td.when(contactService.getContacts({ ownerProfileId: session.accountId })).thenResolve([]);
		const result = await controller.getContacts(session);
		expect({ result: result, input: td.explain(contactService.getContacts).calls.map((call) => call.args) }).toEqual({
			result: [],
			input: [[{ ownerProfileId: session.accountId }]],
		});
	});
	it("forwards pagination and the authenticated account to job listing", async () => {
		await controller.getProfileJobs({ cursor: "cursor" }, session);
		td.verify(jobService.getProfileJobs({ posterProfileId: session.accountId, cursor: "cursor" }));
	});

	it("scopes job details to the authenticated account", async () => {
		const jobId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
		await controller.getProfileJob({ jobId: jobId }, session);
		td.verify(jobService.getProfileJob({ jobId: jobId, posterProfileId: session.accountId }));
		expect(Reflect.getMetadata(PATH_METADATA, controller.getProfileJob)).toBe("me/jobs/:jobId");
	});
});
