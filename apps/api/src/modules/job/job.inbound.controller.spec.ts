import { HttpStatus, VERSION_NEUTRAL } from "@nestjs/common";
import { HTTP_CODE_METADATA, PATH_METADATA, VERSION_METADATA } from "@nestjs/common/constants";
import { Test } from "@nestjs/testing";
import { JobInboundController } from "./job.inbound.controller";
import { JobService } from "./job.service";

describe("JobInboundController", () => {
	let controller: JobInboundController;
	let jobService: { deriveDataForJob: ReturnType<typeof vi.fn> };

	beforeEach(async () => {
		jobService = { deriveDataForJob: vi.fn().mockResolvedValue(undefined) };
		const module = await Test.createTestingModule({
			controllers: [JobInboundController],
			providers: [{ provide: JobService, useValue: jobService }],
		}).compile();

		controller = module.get(JobInboundController);
	});

	it("should keep the inbound derivation route version neutral", () => {
		expect(Reflect.getMetadata(VERSION_METADATA, controller.deriveData)).toBe(VERSION_NEUTRAL);
	});

	it("should exclude the inbound controller from generated Swagger documentation", () => {
		expect(Reflect.getMetadata("swagger/apiExcludeController", JobInboundController)).toEqual([true]);
	});

	it("should expose the job data derivation inbound receiver", () => {
		expect(Reflect.getMetadata(PATH_METADATA, controller.deriveData)).toBe("internal/inbound/derive-job-data");
	});

	it("should return no content after accepting inbound derivation", () => {
		expect(Reflect.getMetadata(HTTP_CODE_METADATA, controller.deriveData)).toBe(HttpStatus.NO_CONTENT);
	});

	it("should pass the inbound job ID to the job service", async () => {
		const message = {
			jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
		};

		await controller.deriveData(message);

		expect(jobService.deriveDataForJob).toHaveBeenCalledWith({ jobId: message.jobId });
	});
});
