import { Test } from "@nestjs/testing";
import { JobService } from "./job.service";
import { JobRepository } from "./repositories/job.repository";
import { JobCategoryRepository } from "./repositories/job-category.repository";
import { JobOutputDto } from "./dto/job-output.dto";
import { JobStatus, JobType, JobPaymentAmountPeriod, JobPaymentType, JobContactMethod } from "../../../generated/prisma/client.js";
import { CategoryNotFoundError } from "./errors/category-not-found.error";
import { JobNotFoundError } from "./errors/job-not-found.error";
import { InvalidJobTypePeriodError } from "./errors/invalid-job-type-period.error";
import { CreateJobRequestDto } from "./dto/create-job-request.dto";
import { CreateJobContactInputDto } from "./dto/create-job-contact-input.dto";
import { CreateJobLocationInputDto } from "./dto/create-job-location-input.dto";
import { JobPaymentInputDto } from "./dto/job-payment-input.dto";
import { LocationUtils } from "../../shared/utils/location/location.utils";
import { JobLocationConstants } from "./job-location.constants";

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/unbound-method */

interface MockJobWithCategory {
	id: string;
	title: string;
	description: string;
	contactName: string;
	contactPhoneNumber: string;
	contactMethod: string;
	street: string | null;
	neighborhood: string;
	city: string;
	state: string;
	country: string;
	fuzzyLatitude: number;
	fuzzyLongitude: number;
	status: string;
	type: string;
	paymentType: string;
	paymentMinAmount: { toNumber(): number } | null;
	paymentMaxAmount: { toNumber(): number } | null;
	paymentNote: string | null;
	paymentAmountPeriod: string;
	paymentCurrency: string;
	categoryId: string;
	createdAt: Date;
	updatedAt: Date;
	category: { id: string; slug: string; createdAt: Date; updatedAt: Date };
	categoryDisplayName: string;
}

const mockJob: MockJobWithCategory = {
	id: "cm3x-job-1",
	title: "Help unload truck",
	description: "Need someone to help unload a delivery truck.",
	contactName: "João Silva",
	contactPhoneNumber: "+5511999999999",
	contactMethod: "WHATSAPP",
	street: "Rua das Flores, 123",
	neighborhood: "Centro",
	city: "São Paulo",
	state: "SP",
	country: "BR",
	fuzzyLatitude: -23.55,
	fuzzyLongitude: -46.63,
	status: "ACTIVE",
	type: "INDIVIDUAL",
	paymentType: "FIXED",
	paymentMinAmount: { toNumber: (): number => 150.0 },
	paymentMaxAmount: null,
	paymentNote: null,
	paymentAmountPeriod: "SINGLE",
	paymentCurrency: "BRL",
	categoryId: "cm3x-cat-1",
	createdAt: new Date("2026-05-28T10:00:00.000Z"),
	updatedAt: new Date("2026-05-28T10:00:00.000Z"),
	category: { id: "cm3x-cat-1", slug: "moving-help", createdAt: new Date("2026-05-28T10:00:00.000Z"), updatedAt: new Date("2026-05-28T10:00:00.000Z") },
	categoryDisplayName: "Moving Help",
};

function createValidDto(): CreateJobRequestDto {
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
	return Object.assign(new CreateJobRequestDto(), dtoData);
}

function buildCreateJobDto(overrides: { type?: JobType; payment?: JobPaymentInputDto }): CreateJobRequestDto {
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

	const dtoData: Partial<CreateJobRequestDto> = {
		title: "Help unload truck",
		description: "Need someone to help unload a delivery truck.",
		contact,
		location,
		type: overrides.type ?? JobType.INDIVIDUAL,
		categoryId: "cm3x-cat-1",
		payment:
			overrides.payment ?? Object.assign(new JobPaymentInputDto(), { type: JobPaymentType.FIXED, minAmount: 150.0, amountPeriod: JobPaymentAmountPeriod.SINGLE, currency: "BRL" }),
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

		it("should throw InvalidJobTypePeriodError when EMPLOYMENT has SINGLE period", async () => {
			const paymentData: Partial<JobPaymentInputDto> = { type: JobPaymentType.FIXED, minAmount: 150.0, amountPeriod: JobPaymentAmountPeriod.SINGLE, currency: "BRL" };
			const payment = Object.assign(new JobPaymentInputDto(), paymentData);
			const dto = buildCreateJobDto({ type: JobType.EMPLOYMENT, payment });

			await expect(service.createJob(dto, "en-US")).rejects.toThrow(InvalidJobTypePeriodError);
		});

		it("should throw InvalidJobTypePeriodError when CONTRACTOR has SINGLE period", async () => {
			const paymentData: Partial<JobPaymentInputDto> = { type: JobPaymentType.FIXED, minAmount: 150.0, amountPeriod: JobPaymentAmountPeriod.SINGLE, currency: "BRL" };
			const payment = Object.assign(new JobPaymentInputDto(), paymentData);
			const dto = buildCreateJobDto({ type: JobType.CONTRACTOR, payment });

			await expect(service.createJob(dto, "en-US")).rejects.toThrow(InvalidJobTypePeriodError);
		});

		it("should not throw when EMPLOYMENT has non-SINGLE period", async () => {
			const paymentData: Partial<JobPaymentInputDto> = { type: JobPaymentType.FIXED, minAmount: 150.0, amountPeriod: JobPaymentAmountPeriod.DAILY, currency: "BRL" };
			const payment = Object.assign(new JobPaymentInputDto(), paymentData);
			const dto = buildCreateJobDto({ type: JobType.EMPLOYMENT, payment });

			await expect(service.createJob(dto, "en-US")).resolves.not.toThrow();
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
				contactPhoneNumber: "+5511999999999",
				contactMethod: "WHATSAPP",
				street: "Rua das Flores, 123",
				neighborhood: "Centro",
				city: "São Paulo",
				state: "SP",
				country: "BR",
				fuzzyLatitude: expect.any(Number),
				fuzzyLongitude: expect.any(Number),
				type: JobType.INDIVIDUAL,
				paymentType: JobPaymentType.FIXED,
				paymentMinAmount: 150.0,
				paymentMaxAmount: null,
				paymentNote: null,
				paymentAmountPeriod: JobPaymentAmountPeriod.SINGLE,
				paymentCurrency: "BRL",
				categoryId: "cm3x-cat-1",
			});
		});

		it("should pass real coordinates as PostGIS location point to the repository", async () => {
			await service.createJob(createValidDto(), "en-US");

			const createCall = (jobRepository.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];

			expect(createCall?.locationPoint).toEqual({ latitude: -23.55052, longitude: -46.633308 });
		});

		it("should fuzz coordinates when street is provided", async () => {
			const randomSpy = vi.spyOn(Math, "random").mockReturnValueOnce(0.5).mockReturnValueOnce(0.25);

			await service.createJob(createValidDto(), "en-US");

			const createData = (jobRepository.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.data;
			randomSpy.mockRestore();

			expect({ latitude: createData?.fuzzyLatitude, longitude: createData?.fuzzyLongitude }).not.toEqual({ latitude: -23.55052, longitude: -46.633308 });
		});

		it("should call location fuzzing with job coordinates and constants when street is provided", async () => {
			const fuzzLocationCoordinateSpy = vi.spyOn(LocationUtils, "fuzzLocationCoordinate");

			await service.createJob(createValidDto(), "en-US");

			expect(fuzzLocationCoordinateSpy).toHaveBeenCalledWith({
				latitude: -23.55052,
				longitude: -46.633308,
				minDistanceMeters: JobLocationConstants.FUZZ_MIN_DISTANCE_METERS,
				maxDistanceMeters: JobLocationConstants.FUZZ_MAX_DISTANCE_METERS,
			});
			fuzzLocationCoordinateSpy.mockRestore();
		});

		it("should pass null for street when not provided", async () => {
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
				title: "Test",
				description: "Test description for the job.",
				contact,
				location,
				type: JobType.INDIVIDUAL,
				categoryId: "cm3x-cat-1",
				payment,
			};
			const dto = Object.assign(new CreateJobRequestDto(), dtoData);

			await service.createJob(dto, "en-US");

			const createData = (jobRepository.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.data;

			expect(createData).toHaveProperty("street", null);
		});

		it("should use real latitude as fuzzy latitude when street is not provided", async () => {
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
			const dto = Object.assign(new CreateJobRequestDto(), {
				title: "Test",
				description: "Test description for the job.",
				contact,
				location,
				type: JobType.INDIVIDUAL,
				categoryId: "cm3x-cat-1",
				payment,
			});

			await service.createJob(dto, "en-US");

			const createData = (jobRepository.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.data;

			expect(createData?.fuzzyLatitude).toBe(-23.55052);
		});

		it("should use real coordinates as fuzzy coordinates when street is null", async () => {
			const dto = createValidDto();
			Object.assign(dto.location, { street: null });

			await service.createJob(dto, "en-US");

			const createData = (jobRepository.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.data;

			expect({ latitude: createData?.fuzzyLatitude, longitude: createData?.fuzzyLongitude }).toEqual({ latitude: -23.55052, longitude: -46.633308 });
		});

		it("should use real coordinates as fuzzy coordinates when street is empty", async () => {
			const dto = createValidDto();
			Object.assign(dto.location, { street: "" });

			await service.createJob(dto, "en-US");

			const createData = (jobRepository.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.data;

			expect({ latitude: createData?.fuzzyLatitude, longitude: createData?.fuzzyLongitude }).toEqual({ latitude: -23.55052, longitude: -46.633308 });
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
