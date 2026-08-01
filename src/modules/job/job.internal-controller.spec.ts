import { HttpStatus, VERSION_NEUTRAL } from "@nestjs/common";
import { HTTP_CODE_METADATA, PATH_METADATA, VERSION_METADATA } from "@nestjs/common/constants";
import { Test } from "@nestjs/testing";
import { DeriveJobDataQueueConstants } from "../../platform/cloudflare/queues/derive-job-data/derive-job-data-queue.constants";
import { GetJobRequestParamsDto } from "./dto/get-job-request-params.dto";
import { JobInternalController } from "./job.internal-controller";
import { JobService } from "./job.service";

describe("JobInternalController", () => {
	let controller: JobInternalController;
	let jobService: { deriveDataForJob: ReturnType<typeof vi.fn> };

	beforeEach(async () => {
		jobService = { deriveDataForJob: vi.fn().mockResolvedValue(undefined) };
		const module = await Test.createTestingModule({
			controllers: [JobInternalController],
			providers: [{ provide: JobService, useValue: jobService }],
		}).compile();

		controller = module.get(JobInternalController);
	});

	it("should expose the controller under the internal job path", () => {
		expect(Reflect.getMetadata(PATH_METADATA, JobInternalController)).toBe("internal/job");
	});

	it("should keep the internal derivation route version neutral", () => {
		expect(Reflect.getMetadata(VERSION_METADATA, controller.deriveData)).toBe(VERSION_NEUTRAL);
	});

	it("should exclude the internal controller from generated Swagger documentation", () => {
		expect(Reflect.getMetadata("swagger/apiExcludeController", JobInternalController)).toEqual([true]);
	});

	it("should expose job data derivation under the job ID", () => {
		expect(Reflect.getMetadata(PATH_METADATA, controller.deriveData)).toBe(
			`:job_id/${DeriveJobDataQueueConstants.INTERNAL_ROUTE}`,
		);
	});

	it("should return no content after accepting queued derivation", () => {
		expect(Reflect.getMetadata(HTTP_CODE_METADATA, controller.deriveData)).toBe(HttpStatus.NO_CONTENT);
	});

	it("should pass the queued job ID to the job service", async () => {
		const params = Object.assign(new GetJobRequestParamsDto(), {
			jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
		});

		await controller.deriveData(params);

		expect(jobService.deriveDataForJob).toHaveBeenCalledWith({ jobId: params.jobId });
	});
});
