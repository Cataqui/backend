import { Test } from "@nestjs/testing";
import { JobService } from "./job.service";
import { JobRepository } from "../repositories/job.repository";
import { JobCategoryRepository } from "../repositories/job-category.repository";
import { JobOutputDto } from "../dto/job-output.dto";
import { JobStatus, JobType, JobPaymentRecurrence } from "../../../../generated/prisma/client.js";
import { CategoryNotFoundError } from "../errors/category-not-found.error";
import { CreateJobRequestDto } from "../dto/create-job-request.dto";
import { CreateJobContactInputDto } from "../dto/create-job-contact-input.dto";
import { CreateJobLocationInputDto } from "../dto/create-job-location-input.dto";
import { CreateJobPaymentInputDto } from "../dto/create-job-payment-input.dto";

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

interface MockJobWithCategory {
	id: string;
	title: string;
	description: string;
	contactName: string;
	contactWhatsapp: string;
	street: string | null;
	neighborhood: string | null;
	city: string;
	state: string;
	country: string;
	status: string;
	type: string;
	paymentAmount: { toNumber(): number };
	paymentRecurrence: string;
	paymentCurrency: string;
	expiresAt: Date;
	categoryId: string;
	createdAt: Date;
	updatedAt: Date;
	category: { id: string; name: string; slug: string };
}

const mockCategory = { id: "cm3x-cat-1", name: "Moving Help", slug: "moving-help", createdAt: new Date(), updatedAt: new Date() };

const mockJob: MockJobWithCategory = {
	id: "cm3x-job-1",
	title: "Help unload truck",
	description: "Need someone to help unload a delivery truck.",
	contactName: "João Silva",
	contactWhatsapp: "+5511999999999",
	street: "Rua das Flores, 123",
	neighborhood: "Centro",
	city: "São Paulo",
	state: "SP",
	country: "BR",
	status: "ACTIVE",
	type: "SINGLE",
	paymentAmount: { toNumber: (): number => 150.0 },
	paymentRecurrence: "SINGLE",
	paymentCurrency: "BRL",
	expiresAt: new Date("2026-06-28T00:00:00.000Z"),
	categoryId: "cm3x-cat-1",
	createdAt: new Date("2026-05-28T10:00:00.000Z"),
	updatedAt: new Date("2026-05-28T10:00:00.000Z"),
	category: { id: "cm3x-cat-1", name: "Moving Help", slug: "moving-help" },
};

function createValidDto(overrides?: Partial<{ expiresAt: string | undefined }>): CreateJobRequestDto {
	const contact = new CreateJobContactInputDto({ name: "João Silva", whatsappNumber: "+5511999999999" });
	const location = new CreateJobLocationInputDto({ city: "São Paulo", state: "SP", country: "BR", street: "Rua das Flores, 123", neighborhood: "Centro" });
	const payment = new CreateJobPaymentInputDto({ amount: 150.0, recurrence: JobPaymentRecurrence.SINGLE, currency: "BRL" });

	return new CreateJobRequestDto({
		title: "Help unload truck",
		description: "Need someone to help unload a delivery truck.",
		contact,
		location,
		type: JobType.SINGLE,
		categoryId: "cm3x-cat-1",
		payment,
		...(overrides?.expiresAt !== undefined ? { expiresAt: overrides.expiresAt } : {}),
	});
}

describe("JobService", () => {
	let service: JobService;
	let jobRepository: JobRepository;
	let jobCategoryRepository: JobCategoryRepository;

	beforeEach(async () => {
		jobRepository = {
			create: vi.fn<(...args: unknown[]) => MockJobWithCategory>().mockReturnValue(mockJob),
		} as unknown as JobRepository;

		jobCategoryRepository = {
			findById: vi.fn().mockResolvedValue(mockCategory),
		} as unknown as JobCategoryRepository;

		const module = await Test.createTestingModule({
			providers: [JobService, { provide: JobRepository, useValue: jobRepository }, { provide: JobCategoryRepository, useValue: jobCategoryRepository }],
		}).compile();

		service = module.get(JobService);
	});

	describe("createJob", () => {
		it("should create a job and return JobOutputDto", async () => {
			const result = await service.createJob(createValidDto());

			expect(result).toBeInstanceOf(JobOutputDto);
			expect(result.jobId).toBe("cm3x-job-1");
			expect(result.title).toBe("Help unload truck");
			expect(result.status).toBe(JobStatus.ACTIVE);
		});

		it("should throw CategoryNotFoundError when category does not exist", async () => {
			(jobCategoryRepository.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

			await expect(service.createJob(createValidDto())).rejects.toThrow(CategoryNotFoundError);
		});

		it("should set default expiration to 30 days when expiresAt is not provided", async () => {
			const before = Date.now();

			await service.createJob(createValidDto());

			const after = Date.now();
			const createCall = (jobRepository.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.data;
			const defaultExpiresAt = (createCall?.expiresAt as Date).getTime();

			const expectedMin = before + 29 * 24 * 60 * 60 * 1000;
			const expectedMax = after + 31 * 24 * 60 * 60 * 1000;

			expect(defaultExpiresAt).toBeGreaterThan(expectedMin);
			expect(defaultExpiresAt).toBeLessThan(expectedMax);
		});

		it("should use provided expiresAt when given", async () => {
			const dto = createValidDto({ expiresAt: "2026-12-01T00:00:00.000Z" });

			await service.createJob(dto);

			const createCall = (jobRepository.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.data;
			expect((createCall?.expiresAt as Date).toISOString()).toBe("2026-12-01T00:00:00.000Z");
		});

		it("should set status to ACTIVE", async () => {
			await service.createJob(createValidDto());

			const createCall = (jobRepository.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.data;
			expect(createCall?.status).toBe(JobStatus.ACTIVE);
		});

		it("should pass all values to the repository", async () => {
			await service.createJob(createValidDto());

			const createData = (jobRepository.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.data;

			expect(createData).toBeDefined();
			expect(createData).toEqual({
				title: "Help unload truck",
				description: "Need someone to help unload a delivery truck.",
				status: JobStatus.ACTIVE,
				contactName: "João Silva",
				contactWhatsapp: "+5511999999999",
				street: "Rua das Flores, 123",
				neighborhood: "Centro",
				city: "São Paulo",
				state: "SP",
				country: "BR",
				type: JobType.SINGLE,
				paymentAmount: 150.0,
				paymentRecurrence: JobPaymentRecurrence.SINGLE,
				paymentCurrency: "BRL",
				expiresAt: expect.any(Date),
				categoryId: "cm3x-cat-1",
			});
		});

		it("should pass null for street and neighborhood when not provided", async () => {
			const contact = new CreateJobContactInputDto({ name: "João Silva", whatsappNumber: "+5511999999999" });
			const location = new CreateJobLocationInputDto({ city: "São Paulo", state: "SP", country: "BR" });
			const payment = new CreateJobPaymentInputDto({ amount: 150.0, recurrence: JobPaymentRecurrence.SINGLE, currency: "BRL" });
			const dto = new CreateJobRequestDto({ title: "Test", description: "Test description for the job.", contact, location, type: JobType.SINGLE, categoryId: "cm3x-cat-1", payment });

			await service.createJob(dto);

			const createData = (jobRepository.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.data;

			expect(createData).toBeDefined();
			expect(createData).toHaveProperty("street", null);
			expect(createData).toHaveProperty("neighborhood", null);
		});
	});
});
