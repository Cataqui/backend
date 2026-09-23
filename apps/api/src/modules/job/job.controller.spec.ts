import { BadRequestException } from "@nestjs/common";
import { PATH_METADATA } from "@nestjs/common/constants";
import { JobController } from "./job.controller";
import type { JobService } from "./job.service";

describe("JobController", () => {
	const service = { createJob: vi.fn(), getPublicJob: vi.fn(), getActiveJobContact: vi.fn() };
	const controller = new JobController(service as unknown as JobService);
	const dto = {
		description: "Preciso de ajuda para descarregar caixas.",
		location: { latitude: -23, longitude: -46 },
		contact: { contactMethod: "WHATSAPP" as const, identifier: "+5511999999999" },
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
});
