import { BadRequestException } from "@nestjs/common";
import { GUARDS_METADATA, HEADERS_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { AccessTokenGuard } from "../auth/guards/access-token.guard";
import { JobController } from "./job.controller";
import type { JobService } from "./job.service";

describe("JobController", () => {
	const service = {
		createJob: vi.fn(),
		getPublicJob: vi.fn(),
		archiveJob: vi.fn(),
		activateJob: vi.fn(),
		getJobContact: vi.fn(),
	};
	const controller = new JobController(service as unknown as JobService);
	const dto = {
		description: "Preciso de ajuda para descarregar caixas.",
		location: { title: "Rua Pardal Branco, 32", latitude: -23, longitude: -46 },
		contact: { method: "WHATSAPP" as const, identifier: "+5511999999999" },
	};
	const session = { userId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" };

	it("exposes direct posting at the jobs collection", () => {
		expect(Reflect.getMetadata(PATH_METADATA, controller.createJob)).toBe("/");
	});

	it("passes a complete post and authenticated user to the service", async () => {
		await controller.createJob(dto, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", session as never);
		expect(service.createJob).toHaveBeenCalledWith({
			dto: dto,
			idempotencyKey: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
			posterUserId: session.userId,
		});
	});

	it("rejects a missing or invalid idempotency key", async () => {
		await expect(controller.createJob(dto, undefined, session as never)).rejects.toBeInstanceOf(BadRequestException);
		await expect(controller.createJob(dto, "bad", session as never)).rejects.toBeInstanceOf(BadRequestException);
	});

	it("requires an access token and passes the poster to job archiving", async () => {
		const jobId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
		await controller.archiveJob({ jobId: jobId }, session as never);
		expect(Reflect.getMetadata(PATH_METADATA, controller.archiveJob)).toBe(":jobId/archive");
		expect(Reflect.getMetadata(GUARDS_METADATA, controller.archiveJob)).toEqual([AccessTokenGuard]);
		expect(service.archiveJob).toHaveBeenCalledWith({ jobId: jobId, posterUserId: session.userId });
	});

	it("requires an access token and passes the poster to job activation", async () => {
		const jobId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
		await controller.activateJob({ jobId: jobId }, session as never);
		expect(Reflect.getMetadata(PATH_METADATA, controller.activateJob)).toBe(":jobId/activate");
		expect(Reflect.getMetadata(GUARDS_METADATA, controller.activateJob)).toEqual([AccessTokenGuard]);
		expect(service.activateJob).toHaveBeenCalledWith({ jobId: jobId, posterUserId: session.userId });
	});

	it("looks up contact details for a specific job without caching", async () => {
		const params = { jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", contactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
		await controller.getJobContact(params);
		expect(Reflect.getMetadata(PATH_METADATA, controller.getJobContact)).toBe(":jobId/contact/:contactId");
		expect(Reflect.getMetadata(HEADERS_METADATA, controller.getJobContact)).toContainEqual({
			name: "Cache-Control",
			value: "no-store",
		});
		expect(service.getJobContact).toHaveBeenCalledWith(params);
	});
});
