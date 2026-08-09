import { HttpStatus, VERSION_NEUTRAL } from "@nestjs/common";
import { HTTP_CODE_METADATA, PATH_METADATA, VERSION_METADATA } from "@nestjs/common/constants";
import { Test } from "@nestjs/testing";
import { JobQueueController } from "./job.queue.controller";
import { JobService } from "./job.service";

describe("JobQueueController", () => {
	let controller: JobQueueController;
	let jobService: { deriveDataForJob: ReturnType<typeof vi.fn> };

	beforeEach(async () => {
		jobService = { deriveDataForJob: vi.fn().mockResolvedValue(undefined) };
		const module = await Test.createTestingModule({
			controllers: [JobQueueController],
			providers: [{ provide: JobService, useValue: jobService }],
		}).compile();

		controller = module.get(JobQueueController);
	});

	it("should keep the controller beneath the shared internal Queue path", () => {
		expect(Reflect.getMetadata(PATH_METADATA, JobQueueController)).toBe("internal/queues");
	});

	it("should keep the internal derivation route version neutral", () => {
		expect(Reflect.getMetadata(VERSION_METADATA, controller.deriveData)).toBe(VERSION_NEUTRAL);
	});

	it("should exclude the internal controller from generated Swagger documentation", () => {
		expect(Reflect.getMetadata("swagger/apiExcludeController", JobQueueController)).toEqual([true]);
	});

	it("should expose the queued job data derivation endpoint", () => {
		expect(Reflect.getMetadata(PATH_METADATA, controller.deriveData)).toBe("cataqui-api-derive-job-data");
	});

	it("should return no content after accepting queued derivation", () => {
		expect(Reflect.getMetadata(HTTP_CODE_METADATA, controller.deriveData)).toBe(HttpStatus.NO_CONTENT);
	});

	it("should pass the queued job ID to the job service", async () => {
		const message = Object.assign(
			{},
			{
				jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
			},
		);

		await controller.deriveData(message);

		expect(jobService.deriveDataForJob).toHaveBeenCalledWith({ jobId: message.jobId });
	});
});
