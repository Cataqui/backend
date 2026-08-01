import { PATH_METADATA } from "@nestjs/common/constants";
import { Test } from "@nestjs/testing";
import { THROTTLER_LIMIT, THROTTLER_TTL } from "@nestjs/throttler/dist/throttler.constants";
import { JobStatus } from "../../../generated/prisma/client.js";
import { CreateJobDraftRequestDto } from "./dto/create-job-draft-request.dto";
import { GetJobRequestParamsDto } from "./dto/get-job-request-params.dto";
import { JobOutputDto } from "./dto/job-output.dto";
import { UpdateJobRequestDto } from "./dto/update-job-request.dto";
import { JobController } from "./job.controller";
import { JobService } from "./job.service";

describe("JobController lifecycle routes", () => {
	let controller: JobController;
	let jobService: {
		createDraft: ReturnType<typeof vi.fn>;
		updateJob: ReturnType<typeof vi.fn>;
		publishJob: ReturnType<typeof vi.fn>;
		getJob: ReturnType<typeof vi.fn>;
		getJobContact: ReturnType<typeof vi.fn>;
	};

	beforeEach(async () => {
		const draft = new JobOutputDto({
			jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
			title: null,
			description: "Descrição original.",
			descriptionSummary: null,
			contactReference: null,
			location: null,
			type: null,
			payment: null,
			status: JobStatus.DRAFT,
			createdAt: "2026-07-30T12:00:00.000Z",
			updatedAt: "2026-07-30T12:00:00.000Z",
		});
		jobService = {
			createDraft: vi.fn().mockResolvedValue(draft),
			updateJob: vi.fn().mockResolvedValue(draft),
			publishJob: vi.fn(),
			getJob: vi.fn(),
			getJobContact: vi.fn(),
		};
		const module = await Test.createTestingModule({
			controllers: [JobController],
			providers: [{ provide: JobService, useValue: jobService }],
		}).compile();

		controller = module.get(JobController);
	});

	it("should expose draft creation at draft", () => {
		expect(Reflect.getMetadata(PATH_METADATA, controller.createDraft)).toBe("draft");
	});

	it("should limit draft creation to five requests per IP", () => {
		expect(Reflect.getMetadata(`${THROTTLER_LIMIT}default`, controller.createDraft)).toBe(5);
	});

	it("should apply a one-minute rate-limit window to draft creation", () => {
		expect(Reflect.getMetadata(`${THROTTLER_TTL}default`, controller.createDraft)).toBe(60_000);
	});

	it("should expose editing at the job ID", () => {
		expect(Reflect.getMetadata(PATH_METADATA, controller.update)).toBe(":job_id");
	});

	it("should expose publication at the nested publish action", () => {
		expect(Reflect.getMetadata(PATH_METADATA, controller.publish)).toBe(":job_id/publish");
	});

	it("should pass PATCH input and locale to the service", async () => {
		const params = Object.assign(new GetJobRequestParamsDto(), {
			jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
		});
		const dto = Object.assign(new UpdateJobRequestDto(), { description: "Nova descrição da oportunidade." });

		await controller.update(params, dto, "pt-BR");

		expect(jobService.updateJob).toHaveBeenCalledWith({
			jobId: params.jobId,
			updatedDto: dto,
			locale: "pt-BR",
		});
	});

	it("should pass the draft ID and locale to publication", async () => {
		const params = Object.assign(new GetJobRequestParamsDto(), {
			jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
		});
		jobService.publishJob.mockResolvedValue({ status: JobStatus.ACTIVE } as JobOutputDto);

		await controller.publish(params, "pt-BR");

		expect(jobService.publishJob).toHaveBeenCalledWith({
			jobId: params.jobId,
			locale: "pt-BR",
		});
	});

	it("should no longer expose the direct create action", () => {
		expect("create" in controller).toBe(false);
	});

	it("should pass only the description to draft creation", async () => {
		const dto = Object.assign(new CreateJobDraftRequestDto(), { description: "Descrição original." });

		await controller.createDraft(dto);

		expect(jobService.createDraft).toHaveBeenCalledWith({ dto: dto });
	});
});
