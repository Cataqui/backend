import type { AuthenticatedSession } from "@cataqui/auth-schemas";
import * as td from "testdouble";
import { BadRequestException } from "@nestjs/common";
import { HEADERS_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import type { z } from "zod";
import { JobController } from "./job.controller";
import type { JobService } from "./job.service";
import type { CreateJobInputSchema } from "./schemas/create-job-input.schema";

afterEach(() => td.reset());

describe("JobController", () => {
	let service: JobService;
	let controller: JobController;
	const dto = {
		description: "Preciso de ajuda para descarregar caixas.",
		location: { title: "Rua Pardal Branco, 32", latitude: -23, longitude: -46 },
		contact: { method: "WHATSAPP" as const, identifier: "+5511999999999" },
	} satisfies z.infer<typeof CreateJobInputSchema>;
	const session: AuthenticatedSession = {
		accountId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
		sessionId: "session-id",
		expiresAt: "2099-01-01T00:00:00.000Z",
	};

	beforeEach(() => {
		service = td.object<JobService>();
		controller = new JobController(service);
	});

	it("exposes direct posting at the jobs collection", () => {
		expect(Reflect.getMetadata(PATH_METADATA, controller.createJob)).toBe("/");
	});

	it("passes a complete post and authenticated account to the service", async () => {
		await controller.createJob(dto, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", session);
		td.verify(
			service.createJob({
				dto: dto,
				idempotencyKey: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
				posterProfileId: session.accountId,
			}),
		);
	});

	it("rejects a missing idempotency key", async () => {
		await expect(controller.createJob(dto, undefined, session)).rejects.toBeInstanceOf(BadRequestException);
		await controller.createJob(dto, "bad", session).catch(() => undefined);
	});

	it("rejects an invalid idempotency key", async () => {
		await controller.createJob(dto, undefined, session).catch(() => undefined);
		await expect(controller.createJob(dto, "bad", session)).rejects.toBeInstanceOf(BadRequestException);
	});

	it("passes the selected job ID to job lookup", async () => {
		const jobId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
		await controller.getJob({ jobId: jobId });
		td.verify(service.getPublicJob({ jobId: jobId }));
	});

	it("exposes job archiving at the job archive route", async () => {
		const jobId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
		await controller.archiveJob({ jobId: jobId }, session);
		expect(Reflect.getMetadata(PATH_METADATA, controller.archiveJob)).toBe(":jobId/archive");
	});

	it("passes the authenticated poster to job archiving", async () => {
		const jobId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
		await controller.archiveJob({ jobId: jobId }, session);

		td.verify(service.archiveJob({ jobId: jobId, posterProfileId: session.accountId }));
	});

	it("exposes job activation at the job activate route", async () => {
		const jobId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
		await controller.activateJob({ jobId: jobId }, session);
		expect(Reflect.getMetadata(PATH_METADATA, controller.activateJob)).toBe(":jobId/activate");
	});

	it("passes the authenticated poster to job activation", async () => {
		const jobId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
		await controller.activateJob({ jobId: jobId }, session);

		td.verify(service.activateJob({ jobId: jobId, posterProfileId: session.accountId }));
	});

	it("exposes contact lookup for one job and contact", async () => {
		const params = { jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", contactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
		await controller.getJobContact(params);
		expect(Reflect.getMetadata(PATH_METADATA, controller.getJobContact)).toBe(":jobId/contact/:contactId");
	});

	it("prevents caching job contact details", async () => {
		const params = { jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", contactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
		await controller.getJobContact(params);

		expect(Reflect.getMetadata(HEADERS_METADATA, controller.getJobContact)).toContainEqual({
			name: "Cache-Control",
			value: "no-store",
		});
	});

	it("passes the selected job and contact to contact lookup", async () => {
		const params = { jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", contactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
		await controller.getJobContact(params);

		td.verify(service.getJobContact(params));
	});
});
