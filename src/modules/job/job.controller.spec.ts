/* eslint-disable @typescript-eslint/unbound-method */
import { Test } from "@nestjs/testing";
import { PATH_METADATA } from "@nestjs/common/constants";
import { JobController } from "./job.controller";
import { JobService } from "./job.service";
import { CreateJobRequestDto } from "./dto/create-job-request.dto";
import { GetJobRequestParamsDto } from "./dto/get-job-request-params.dto";
import { CreateJobContactInputDto } from "./dto/create-job-contact-input.dto";
import { CreateJobLocationInputDto } from "./dto/create-job-location-input.dto";
import { JobPaymentInputDto } from "./dto/job-payment-input.dto";
import { JobOutputDto } from "./dto/job-output.dto";
import { JobContactOutputDto } from "./dto/job-contact-output.dto";
import { JobLocationOutputDto } from "./dto/job-location-output.dto";
import { JobCategoryOutputDto } from "./dto/job-category-output.dto";
import { JobPaymentOutputDto } from "./dto/job-payment-output.dto";
import { MapAuthOutputDto } from "../map/dto/map-auth-output.dto";
import { JobStatus, JobType, JobPaymentAmountPeriod, JobPaymentType, JobContactMethod } from "../../../generated/prisma/client.js";

function createMockJobOutputDto(): JobOutputDto {
	return new JobOutputDto({
		jobId: "cm3x-job-1",
		title: "Help unload truck",
		description: "Need someone to help unload a delivery truck.",
		contact: new JobContactOutputDto({ contactName: "João Silva", contactPhoneNumber: "+5511999999999", contactMethod: JobContactMethod.WHATSAPP }),
		location: new JobLocationOutputDto({
			neighborhood: "Centro",
			city: "São Paulo",
			state: "SP",
			country: "BR",
			latitude: -23.55,
			longitude: -46.63,
			mapAuth: new MapAuthOutputDto({
				queryParams: "v=1&sig=abc&exp=123",
				expiresAt: "2026-01-01T00:00:00.000Z",
				mapVersion: "br",
				tilesUrlTemplate: "https://tiles.cataqui.com/br/br/{z}/{x}/{y}.mvt",
				glyphUrlTemplate: "https://tiles.cataqui.com/glyphs/{fontstack}/{range}.pbf",
			}),
		}),
		category: new JobCategoryOutputDto({ categoryId: "cm3x-cat-1", name: "Moving Help", slug: "moving-help" }),
		payment: new JobPaymentOutputDto({
			paymentType: JobPaymentType.FIXED,
			paymentMinAmount: 150.0,
			paymentMaxAmount: null,
			paymentNote: null,
			paymentAmountPeriod: JobPaymentAmountPeriod.SINGLE,
			paymentCurrency: "BRL",
		}),
		status: JobStatus.ACTIVE,
		type: JobType.INDIVIDUAL,
		createdAt: "2026-05-28T10:00:00.000Z",
		updatedAt: "2026-05-28T10:00:00.000Z",
	});
}

describe("JobController", () => {
	let controller: JobController;
	let jobService: JobService;

	beforeEach(async () => {
		jobService = {
			createJob: vi.fn().mockImplementation(() => Promise.resolve(createMockJobOutputDto())),
			getJob: vi.fn().mockImplementation(() => Promise.resolve(createMockJobOutputDto())),
		} as unknown as JobService;

		const module = await Test.createTestingModule({
			controllers: [JobController],
			providers: [{ provide: JobService, useValue: jobService }],
		}).compile();

		controller = module.get(JobController);
	});

	describe("create", () => {
		it("should expose the create action at the job collection route", () => {
			expect(Reflect.getMetadata(PATH_METADATA, controller.create)).toBe("/");
		});

		it("should return JobOutputDto on success", async () => {
			const contactData: Partial<CreateJobContactInputDto> = { name: "João Silva", phoneNumber: "+5511999999999", method: JobContactMethod.WHATSAPP };
			const contact = Object.assign(new CreateJobContactInputDto(), contactData);
			const locationData: Partial<CreateJobLocationInputDto> = {
				city: "São Paulo",
				state: "SP",
				country: "BR",
				street: "Rua das Flores, 123",
				neighborhood: "Centro",
				latitude: -23.55052,
				longitude: -46.633308,
			};
			const location = Object.assign(new CreateJobLocationInputDto(), locationData);
			const paymentData: Partial<JobPaymentInputDto> = { type: JobPaymentType.FIXED, minAmount: 150.0, amountPeriod: JobPaymentAmountPeriod.SINGLE, currency: "BRL" };
			const payment = Object.assign(new JobPaymentInputDto(), paymentData);
			const dtoData: Partial<CreateJobRequestDto> = {
				title: "Help unload truck",
				description: "Need someone to help unload a delivery truck.",
				contact,
				location,
				type: JobType.INDIVIDUAL,
				categoryId: "cm3x-cat-1",
				payment,
			};
			const dto = Object.assign(new CreateJobRequestDto(), dtoData);

			const result = await controller.create(dto, "en-US");

			expect(result).toBeInstanceOf(JobOutputDto);
			expect(result.title).toBe("Help unload truck");
			expect(result.status).toBe(JobStatus.ACTIVE);
		});

		it("should pass the DTO and locale to jobService.createJob", async () => {
			const contactData: Partial<CreateJobContactInputDto> = { name: "João Silva", phoneNumber: "+5511999999999", method: JobContactMethod.WHATSAPP };
			const contact = Object.assign(new CreateJobContactInputDto(), contactData);
			const locationData: Partial<CreateJobLocationInputDto> = {
				city: "São Paulo",
				state: "SP",
				country: "BR",
				neighborhood: "Centro",
				latitude: -23.55052,
				longitude: -46.633308,
			};
			const location = Object.assign(new CreateJobLocationInputDto(), locationData);
			const paymentData: Partial<JobPaymentInputDto> = { type: JobPaymentType.FIXED, minAmount: 150.0, amountPeriod: JobPaymentAmountPeriod.SINGLE, currency: "BRL" };
			const payment = Object.assign(new JobPaymentInputDto(), paymentData);
			const dtoData: Partial<CreateJobRequestDto> = {
				title: "Help unload truck",
				description: "Need someone to help unload a delivery truck.",
				contact,
				location,
				type: JobType.INDIVIDUAL,
				categoryId: "cm3x-cat-1",
				payment,
			};
			const dto = Object.assign(new CreateJobRequestDto(), dtoData);

			await controller.create(dto, "en-US");

			expect(jobService.createJob).toHaveBeenCalledWith(dto, "en-US");
		});
	});

	describe("findOne", () => {
		it("should return JobOutputDto on success", async () => {
			const params = Object.assign(new GetJobRequestParamsDto(), { jobId: "afdfd9b2-203d-4528-8a1c-82b6b139039b" });
			const result = await controller.getJob(params, "en-US");

			expect(result).toBeInstanceOf(JobOutputDto);
			expect(result.title).toBe("Help unload truck");
			expect(result.status).toBe(JobStatus.ACTIVE);
		});

		it("should pass jobId and locale to jobService.getJob", async () => {
			const params = Object.assign(new GetJobRequestParamsDto(), { jobId: "afdfd9b2-203d-4528-8a1c-82b6b139039b" });
			await controller.getJob(params, "pt-BR");

			expect(jobService.getJob).toHaveBeenCalledWith({ jobId: "afdfd9b2-203d-4528-8a1c-82b6b139039b", locale: "pt-BR" });
		});
	});
});
