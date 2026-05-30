import { Test } from "@nestjs/testing";
import { JobService } from "./job.service";
import { JobRepository } from "./repositories/job.repository";
import { JobCategoryRepository } from "./repositories/job-category.repository";
import { JobOutputDto } from "./dto/job-output.dto";
import { JobStatus, JobType, JobPaymentRecurrence } from "../../../generated/prisma/client.js";
import { CategoryNotFoundError } from "./errors/category-not-found.error";
import { JobNotFoundError } from "./errors/job-not-found.error";
import { CreateJobRequestDto } from "./dto/create-job-request.dto";
import { CreateJobContactInputDto } from "./dto/create-job-contact-input.dto";
import { CreateJobLocationInputDto } from "./dto/create-job-location-input.dto";
import { CreateJobPaymentInputDto } from "./dto/create-job-payment-input.dto";

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/unbound-method */

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
	categoryId: string;
	createdAt: Date;
	updatedAt: Date;
	category: { id: string; name: string; slug: string; createdAt: Date; updatedAt: Date };
	categoryDisplayName: string;
}

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
	categoryId: "cm3x-cat-1",
	createdAt: new Date("2026-05-28T10:00:00.000Z"),
	updatedAt: new Date("2026-05-28T10:00:00.000Z"),
	category: { id: "cm3x-cat-1", name: "Moving Help", slug: "moving-help", createdAt: new Date("2026-05-28T10:00:00.000Z"), updatedAt: new Date("2026-05-28T10:00:00.000Z") },
	categoryDisplayName: "Moving Help",
};

function createValidDto(): CreateJobRequestDto {
	const contactData: Partial<CreateJobContactInputDto> = { name: "João Silva", whatsappNumber: "+5511999999999" };
	const contact = Object.assign(new CreateJobContactInputDto(), contactData);
	const locationData: Partial<CreateJobLocationInputDto> = { city: "São Paulo", state: "SP", country: "BR", street: "Rua das Flores, 123", neighborhood: "Centro" };
	const location = Object.assign(new CreateJobLocationInputDto(), locationData);
	const paymentData: Partial<CreateJobPaymentInputDto> = { amount: 150.0, recurrence: JobPaymentRecurrence.SINGLE, currency: "BRL" };
	const payment = Object.assign(new CreateJobPaymentInputDto(), paymentData);

	const dtoData: Partial<CreateJobRequestDto> = {
		title: "Help unload truck",
		description: "Need someone to help unload a delivery truck.",
		contact,
		location,
		type: JobType.SINGLE,
		categoryId: "cm3x-cat-1",
		payment,
	};
	return Object.assign(new CreateJobRequestDto(), dtoData);
}

describe("JobService", () => {
	let service: JobService;
	let jobRepository: JobRepository;
	let jobCategoryRepository: JobCategoryRepository;

	beforeEach(async () => {
		jobRepository = {
			create: vi.fn<(...args: unknown[]) => MockJobWithCategory>().mockReturnValue(mockJob),
			findByIdLocalized: vi.fn<(...args: unknown[]) => MockJobWithCategory | null>().mockResolvedValue(mockJob),
		} as unknown as JobRepository;

		jobCategoryRepository = {
			findByIdWithLocalizedName: vi.fn().mockResolvedValue({ id: "cm3x-cat-1", slug: "moving-help", displayName: "Moving Help" }),
		} as unknown as JobCategoryRepository;

		const module = await Test.createTestingModule({
			providers: [JobService, { provide: JobRepository, useValue: jobRepository }, { provide: JobCategoryRepository, useValue: jobCategoryRepository }],
		}).compile();

		service = module.get(JobService);
	});

	describe("createJob", () => {
		it("should create a job and return JobOutputDto", async () => {
			const result = await service.createJob(createValidDto(), "en-US");

			expect(result).toBeInstanceOf(JobOutputDto);
			expect(result.jobId).toBe("cm3x-job-1");
			expect(result.title).toBe("Help unload truck");
			expect(result.status).toBe(JobStatus.ACTIVE);
		});

		it("should throw CategoryNotFoundError when category does not exist", async () => {
			(jobCategoryRepository.findByIdWithLocalizedName as ReturnType<typeof vi.fn>).mockResolvedValue(null);

			await expect(service.createJob(createValidDto(), "en-US")).rejects.toThrow(CategoryNotFoundError);
		});

		it("should set status to ACTIVE", async () => {
			await service.createJob(createValidDto(), "en-US");

			const createCall = (jobRepository.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.data;
			expect(createCall?.status).toBe(JobStatus.ACTIVE);
		});

		it("should pass all values to the repository", async () => {
			await service.createJob(createValidDto(), "en-US");

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
				categoryId: "cm3x-cat-1",
			});
		});

		it("should pass null for street and neighborhood when not provided", async () => {
			const contactData: Partial<CreateJobContactInputDto> = { name: "João Silva", whatsappNumber: "+5511999999999" };
			const contact = Object.assign(new CreateJobContactInputDto(), contactData);
			const locationData: Partial<CreateJobLocationInputDto> = { city: "São Paulo", state: "SP", country: "BR" };
			const location = Object.assign(new CreateJobLocationInputDto(), locationData);
			const paymentData: Partial<CreateJobPaymentInputDto> = { amount: 150.0, recurrence: JobPaymentRecurrence.SINGLE, currency: "BRL" };
			const payment = Object.assign(new CreateJobPaymentInputDto(), paymentData);
			const dtoData: Partial<CreateJobRequestDto> = {
				title: "Test",
				description: "Test description for the job.",
				contact,
				location,
				type: JobType.SINGLE,
				categoryId: "cm3x-cat-1",
				payment,
			};
			const dto = Object.assign(new CreateJobRequestDto(), dtoData);

			await service.createJob(dto, "en-US");

			const createData = (jobRepository.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.data;

			expect(createData).toBeDefined();
			expect(createData).toHaveProperty("street", null);
			expect(createData).toHaveProperty("neighborhood", null);
		});

		it("should use translated category name when translation exists", async () => {
			(jobCategoryRepository.findByIdWithLocalizedName as ReturnType<typeof vi.fn>).mockResolvedValue({
				id: "cm3x-cat-1",
				slug: "moving-help",
				displayName: "Ayuda con mudanza",
			});

			const result = await service.createJob(createValidDto(), "es-MX");

			expect(result.category.name).toBe("Ayuda con mudanza");
		});

		it("should fall back to base category name when no translation exists", async () => {
			(jobCategoryRepository.findByIdWithLocalizedName as ReturnType<typeof vi.fn>).mockResolvedValue({
				id: "cm3x-cat-1",
				slug: "moving-help",
				displayName: "Moving Help",
			});

			const result = await service.createJob(createValidDto(), "fr-FR");

			expect(result.category.name).toBe("Moving Help");
		});
	});

	describe("getJob", () => {
		it("should return JobOutputDto when job exists", async () => {
			const result = await service.getJob({ jobId: "cm3x-job-1", locale: "en-US" });

			expect(result).toBeInstanceOf(JobOutputDto);
			expect(result.jobId).toBe("cm3x-job-1");
			expect(result.title).toBe("Help unload truck");
			expect(result.status).toBe(JobStatus.ACTIVE);
		});

		it("should throw JobNotFoundError when job does not exist", async () => {
			(jobRepository.findByIdLocalized as ReturnType<typeof vi.fn>).mockResolvedValue(null);

			await expect(service.getJob({ jobId: "nonexistent", locale: "en-US" })).rejects.toThrow(JobNotFoundError);
		});

		it("should use categoryDisplayName from repository for localized name", async () => {
			(jobRepository.findByIdLocalized as ReturnType<typeof vi.fn>).mockResolvedValue({ ...mockJob, categoryDisplayName: "Ayuda con mudanza" });

			const result = await service.getJob({ jobId: "cm3x-job-1", locale: "es-MX" });

			expect(result.category.name).toBe("Ayuda con mudanza");
		});

		it("should pass jobId and locale to findByIdLocalized", async () => {
			await service.getJob({ jobId: "cm3x-job-1", locale: "pt-BR" });

			expect(jobRepository.findByIdLocalized).toHaveBeenCalledWith({ id: "cm3x-job-1", locale: "pt-BR" });
		});
	});
});
