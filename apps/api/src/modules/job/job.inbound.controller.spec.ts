import { HttpStatus, VERSION_NEUTRAL } from "@nestjs/common";
import { HTTP_CODE_METADATA, PATH_METADATA, VERSION_METADATA } from "@nestjs/common/constants";
import { Test } from "@nestjs/testing";
import { ObservabilityService } from "../../core/observability/observability.service";
import { ObservabilityOperationName } from "../../core/observability/observability-operation-name.enum";
import { JobInboundController } from "./job.inbound.controller";
import { JobService } from "./job.service";

describe("JobInboundController", () => {
	let controller: JobInboundController;
	let jobService: { deriveDataForJob: ReturnType<typeof vi.fn> };
	let observabilityService: { observeOperation: ReturnType<typeof vi.fn> };

	beforeEach(async () => {
		jobService = { deriveDataForJob: vi.fn().mockResolvedValue(undefined) };
		observabilityService = {
			observeOperation: vi.fn(async (params: { operation: () => Promise<unknown> }) => params.operation()),
		};
		const module = await Test.createTestingModule({
			controllers: [JobInboundController],
			providers: [
				{ provide: JobService, useValue: jobService },
				{ provide: ObservabilityService, useValue: observabilityService },
			],
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

	it("should observe queued job derivation through the typed operation registry", async () => {
		await controller.deriveData({ jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" });

		expect(observabilityService.observeOperation).toHaveBeenCalledWith({
			operation: expect.any(Function),
			operationName: ObservabilityOperationName.JOB_DATA_DERIVATION,
		});
	});
});
