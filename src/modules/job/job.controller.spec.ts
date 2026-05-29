/* eslint-disable @typescript-eslint/unbound-method */
import { Test } from "@nestjs/testing";
import { JobController } from "./job.controller";
import { JobService } from "./services/job.service";
import { CreateJobRequestDto } from "./dto/create-job-request.dto";
import { CreateJobContactInputDto } from "./dto/create-job-contact-input.dto";
import { CreateJobLocationInputDto } from "./dto/create-job-location-input.dto";
import { CreateJobPaymentInputDto } from "./dto/create-job-payment-input.dto";
import { JobOutputDto } from "./dto/job-output.dto";
import { JobContactOutputDto } from "./dto/job-contact-output.dto";
import { JobLocationOutputDto } from "./dto/job-location-output.dto";
import { JobCategoryOutputDto } from "./dto/job-category-output.dto";
import { PaymentOutputDto } from "./dto/payment-output.dto";
import { JobStatus, JobType, JobPaymentRecurrence } from "../../../generated/prisma/client.js";

function createMockJobOutputDto(): JobOutputDto {
	return new JobOutputDto({
		jobId: "cm3x-job-1",
		title: "Help unload truck",
		description: "Need someone to help unload a delivery truck.",
		contact: new JobContactOutputDto({ contactName: "João Silva", contactWhatsapp: "+5511999999999" }),
		location: new JobLocationOutputDto({ street: "Rua das Flores, 123", neighborhood: "Centro", city: "São Paulo", state: "SP", country: "BR" }),
		category: new JobCategoryOutputDto({ categoryId: "cm3x-cat-1", name: "Moving Help", slug: "moving-help" }),
		payment: new PaymentOutputDto({ paymentAmount: 150.0, paymentRecurrence: JobPaymentRecurrence.SINGLE, paymentCurrency: "BRL" }),
		status: JobStatus.ACTIVE,
		type: JobType.SINGLE,
		expiresAt: "2026-06-28T00:00:00.000Z",
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
		} as unknown as JobService;

		const module = await Test.createTestingModule({
			controllers: [JobController],
			providers: [{ provide: JobService, useValue: jobService }],
		}).compile();

		controller = module.get(JobController);
	});

	describe("create", () => {
		it("should return JobOutputDto on success", async () => {
			const contact = new CreateJobContactInputDto({ name: "João Silva", whatsappNumber: "+5511999999999" });
			const location = new CreateJobLocationInputDto({ city: "São Paulo", state: "SP", country: "BR", street: "Rua das Flores, 123", neighborhood: "Centro" });
			const payment = new CreateJobPaymentInputDto({ amount: 150.0, recurrence: JobPaymentRecurrence.SINGLE, currency: "BRL" });
			const dto = new CreateJobRequestDto({
				title: "Help unload truck",
				description: "Need someone to help unload a delivery truck.",
				contact,
				location,
				type: JobType.SINGLE,
				categoryId: "cm3x-cat-1",
				payment,
			});

			const result = await controller.create(dto);

			expect(result).toBeInstanceOf(JobOutputDto);
			expect(result.title).toBe("Help unload truck");
			expect(result.status).toBe(JobStatus.ACTIVE);
		});

		it("should pass the DTO directly to jobService.createJob", async () => {
			const contact = new CreateJobContactInputDto({ name: "João Silva", whatsappNumber: "+5511999999999" });
			const location = new CreateJobLocationInputDto({ city: "São Paulo", state: "SP", country: "BR" });
			const payment = new CreateJobPaymentInputDto({ amount: 150.0, recurrence: JobPaymentRecurrence.SINGLE, currency: "BRL" });
			const dto = new CreateJobRequestDto({
				title: "Help unload truck",
				description: "Need someone to help unload a delivery truck.",
				contact,
				location,
				type: JobType.SINGLE,
				categoryId: "cm3x-cat-1",
				payment,
			});

			await controller.create(dto);

			expect(jobService.createJob).toHaveBeenCalledWith(dto);
		});

		it("should forward expiresAt as a string to the service", async () => {
			const contact = new CreateJobContactInputDto({ name: "João Silva", whatsappNumber: "+5511999999999" });
			const location = new CreateJobLocationInputDto({ city: "São Paulo", state: "SP", country: "BR" });
			const payment = new CreateJobPaymentInputDto({ amount: 150.0, recurrence: JobPaymentRecurrence.SINGLE, currency: "BRL" });
			const dto = new CreateJobRequestDto({
				title: "Help unload truck",
				description: "Need someone to help unload a delivery truck.",
				contact,
				location,
				type: JobType.SINGLE,
				categoryId: "cm3x-cat-1",
				payment,
				expiresAt: "2026-12-01T00:00:00Z",
			});

			await controller.create(dto);

			expect(jobService.createJob).toHaveBeenCalledWith(dto);
		});
	});
});
