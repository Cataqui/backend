/* eslint-disable @typescript-eslint/unbound-method */

import { PATH_METADATA } from "@nestjs/common/constants";
import { Test } from "@nestjs/testing";
import {
	JobContactMethod,
	JobPaymentAmountPeriod,
	JobPaymentType,
	JobStatus,
	JobType,
} from "../../../generated/prisma/client.js";
import { JobPaymentOutputDto } from "../../shared/dto/job/job-payment-output.dto";
import { MapConfigOutputDto } from "../map/dto/map-config-output.dto";
import { CreateJobContactInputDto } from "./dto/create-job-contact-input.dto";
import { CreateJobLocationInputDto } from "./dto/create-job-location-input.dto";
import { CreateJobRequestDto } from "./dto/create-job-request.dto";
import { GetJobContactRequestParamsDto } from "./dto/get-job-contact-request-params.dto";
import { GetJobRequestParamsDto } from "./dto/get-job-request-params.dto";
import { JobCategoryOutputDto } from "./dto/job-category-output.dto";
import { JobContactOutputDto } from "./dto/job-contact-output.dto";
import { JobContactReferenceOutputDto } from "./dto/job-contact-reference-output.dto";
import { JobLocationOutputDto } from "./dto/job-location-output.dto";
import { JobOutputDto } from "./dto/job-output.dto";
import { JobPaymentInputDto } from "./dto/job-payment-input.dto";
import { JobController } from "./job.controller";
import { JobService } from "./job.service";

function createMockJobContactOutputDto(): JobContactOutputDto {
	return JobContactOutputDto.fromDatabase({
		contactMethod: JobContactMethod.WHATSAPP,
		identifier: "+5511999999999",
	});
}

function createMockJobOutputDto(): JobOutputDto {
	return new JobOutputDto({
		jobId: "cm3x-job-1",
		title: "Help unload truck",
		description: "Need someone to help unload a delivery truck.",
		contactReference: new JobContactReferenceOutputDto({
			contactId: "cm3x-contact-1",
			contactMethod: JobContactMethod.WHATSAPP,
		}),
		location: new JobLocationOutputDto({
			neighborhood: "Centro",
			city: "São Paulo",
			state: "SP",
			country: "BR",
			latitude: -23.55,
			longitude: -46.63,
			mapConfig: new MapConfigOutputDto({
				queryParams: "v=1&sig=abc&exp=123",
				expiresAt: "2026-01-01T00:00:00.000Z",
				mapVersion: "br",
				fontstack: "inter",
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
			getJobContact: vi.fn().mockImplementation(() => Promise.resolve(createMockJobContactOutputDto())),
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
			const contact = Object.assign(new CreateJobContactInputDto(), {
				contactMethod: JobContactMethod.WHATSAPP,
				identifier: "+5511999999999",
			});
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
			const paymentData: Partial<JobPaymentInputDto> = {
				type: JobPaymentType.FIXED,
				minAmount: 150.0,
				amountPeriod: JobPaymentAmountPeriod.SINGLE,
				currency: "BRL",
			};
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
			const contact = Object.assign(new CreateJobContactInputDto(), {
				contactMethod: JobContactMethod.WHATSAPP,
				identifier: "+5511999999999",
			});
			const locationData: Partial<CreateJobLocationInputDto> = {
				city: "São Paulo",
				state: "SP",
				country: "BR",
				neighborhood: "Centro",
				latitude: -23.55052,
				longitude: -46.633308,
			};
			const location = Object.assign(new CreateJobLocationInputDto(), locationData);
			const paymentData: Partial<JobPaymentInputDto> = {
				type: JobPaymentType.FIXED,
				minAmount: 150.0,
				amountPeriod: JobPaymentAmountPeriod.SINGLE,
				currency: "BRL",
			};
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

			expect(jobService.createJob).toHaveBeenCalledWith({ dto: dto, locale: "en-US" });
		});
	});

	describe("getJobContact", () => {
		it("should expose the getJobContact action at the nested contact route", () => {
			expect(Reflect.getMetadata(PATH_METADATA, controller.getJobContact)).toBe(":job_id/contact/:contact_id");
		});

		it("should return JobContactOutputDto on success", async () => {
			const params = Object.assign(new GetJobContactRequestParamsDto(), {
				jobId: "afdfd9b2-203d-4528-8a1c-82b6b139039b",
				contactId: "cm3x-contact-1",
			});
			const result = await controller.getJobContact(params);

			expect(result).toBeInstanceOf(JobContactOutputDto);
		});

		it("should pass contactId and jobId to jobService.getJobContact", async () => {
			const params = Object.assign(new GetJobContactRequestParamsDto(), {
				jobId: "afdfd9b2-203d-4528-8a1c-82b6b139039b",
				contactId: "cm3x-contact-1",
			});
			await controller.getJobContact(params);

			expect(jobService.getJobContact).toHaveBeenCalledWith({
				contactId: "cm3x-contact-1",
				jobId: "afdfd9b2-203d-4528-8a1c-82b6b139039b",
			});
		});

		it("should return WHATSAPP contact method on success", async () => {
			const expected = JobContactOutputDto.fromDatabase({
				contactMethod: JobContactMethod.WHATSAPP,
				identifier: "+5511999999999",
			});
			(jobService.getJobContact as ReturnType<typeof vi.fn>).mockResolvedValueOnce(expected);

			const params = Object.assign(new GetJobContactRequestParamsDto(), {
				jobId: "afdfd9b2-203d-4528-8a1c-82b6b139039b",
				contactId: "cm3x-contact-1",
			});

			const result = await controller.getJobContact(params);

			expect(result.contactMethod).toBe(JobContactMethod.WHATSAPP);
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

			expect(jobService.getJob).toHaveBeenCalledWith({
				jobId: "afdfd9b2-203d-4528-8a1c-82b6b139039b",
				locale: "pt-BR",
			});
		});
	});
});
