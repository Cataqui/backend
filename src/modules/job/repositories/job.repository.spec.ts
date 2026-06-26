import { Test } from "@nestjs/testing";
import type { Prisma } from "../../../../generated/prisma/client.js";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { LocaleConstants } from "../../../shared/locale/locale.constants";
import { JobRepository } from "./job.repository";

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/unbound-method */

interface MockCategoryWithTranslations {
	id: string;
	name: string;
	slug: string;
	createdAt: Date;
	updatedAt: Date;
	translations: Array<{ id: string; name: string; locale: string }>;
}

interface MockJobWithCategory {
	id: string;
	title: string;
	description: string;
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
	category: MockCategoryWithTranslations;
}

const mockTranslations = [
	{ id: "t-en", name: "Moving Help", locale: LocaleConstants.DEFAULT_LOCALE },
	{ id: "t-es", name: "Ayuda con mudanza", locale: "es-MX" },
];

const mockJob: MockJobWithCategory = {
	id: "cm3x-1234",
	title: "Help unload truck",
	description: "Need someone to help.",
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
	category: {
		id: "cm3x-cat-1",
		name: "Moving Help",
		slug: "moving-help",
		createdAt: new Date("2026-05-28T10:00:00.000Z"),
		updatedAt: new Date("2026-05-28T10:00:00.000Z"),
		translations: mockTranslations,
	},
};

const createParams: Prisma.JobUncheckedCreateInput = {
	title: "Help unload truck",
	description: "Need someone to help.",
	descriptionSummary: "Need someone to help.",
	status: "ACTIVE",
	contactPhoneNumber: "+5511999999999",
	contactMethod: "WHATSAPP",
	street: "Rua das Flores, 123",
	neighborhood: "Centro",
	city: "São Paulo",
	state: "SP",
	country: "BR",
	fuzzyLatitude: -23.55,
	fuzzyLongitude: -46.63,
	type: "INDIVIDUAL",
	paymentType: "FIXED",
	paymentMinAmount: 150.0,
	paymentMaxAmount: null,
	paymentNote: null,
	paymentAmountPeriod: "SINGLE",
	paymentCurrency: "BRL",
	categoryId: "cm3x-cat-1",
};

describe("JobRepository", () => {
	let repository: JobRepository;
	let prisma: PrismaService;
	let executeRaw: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		executeRaw = vi.fn().mockResolvedValue(1);
		prisma = {
			$transaction: vi.fn((callback: (tx: unknown) => unknown) =>
				callback({ job: { create: prisma.job.create }, $executeRaw: executeRaw }),
			),
			job: {
				create: vi.fn<(...args: unknown[]) => MockJobWithCategory>().mockReturnValue(mockJob),
				findUnique: vi.fn<(...args: unknown[]) => MockJobWithCategory | null>().mockResolvedValue(mockJob),
				update: vi.fn().mockResolvedValue(mockJob),
			},
		} as unknown as PrismaService;

		const module = await Test.createTestingModule({
			providers: [JobRepository, { provide: PrismaService, useValue: prisma }],
		}).compile();

		repository = module.get(JobRepository);
	});

	describe("create", () => {
		it("should call prisma.job.create with flattened data and include category", async () => {
			await repository.create({ data: createParams, locationPoint: { latitude: -23.55052, longitude: -46.633308 } });

			expect(prisma.job.create).toHaveBeenCalledWith({
				data: {
					title: "Help unload truck",
					description: "Need someone to help.",
					descriptionSummary: "Need someone to help.",
					status: "ACTIVE",
					contactPhoneNumber: "+5511999999999",
					contactMethod: "WHATSAPP",
					street: "Rua das Flores, 123",
					neighborhood: "Centro",
					city: "São Paulo",
					state: "SP",
					country: "BR",
					fuzzyLatitude: -23.55,
					fuzzyLongitude: -46.63,
					type: "INDIVIDUAL",
					paymentType: "FIXED",
					paymentMinAmount: 150.0,
					paymentMaxAmount: null,
					paymentNote: null,
					paymentAmountPeriod: "SINGLE",
					paymentCurrency: "BRL",
					categoryId: "cm3x-cat-1",
				},
				include: { category: true },
			});
		});

		it("should return the created job with category", async () => {
			const result = await repository.create({
				data: createParams,
				locationPoint: { latitude: -23.55052, longitude: -46.633308 },
			});

			expect(result).toEqual(mockJob);
			expect(result.category).toBeDefined();
		});

		it("should convert nullish street to null", async () => {
			const params = { ...createParams, street: undefined as unknown as string | null };
			await repository.create({ data: params, locationPoint: { latitude: -23.55052, longitude: -46.633308 } });

			const callData = (prisma.job.create as ReturnType<typeof vi.fn>).mock.calls[1]?.[0]?.data;

			if (callData) {
				expect(callData.street).toBeNull();
			}
		});

		it("should wrap create and PostGIS point update in a transaction", async () => {
			await repository.create({ data: createParams, locationPoint: { latitude: -23.55052, longitude: -46.633308 } });

			expect(prisma.$transaction).toHaveBeenCalledOnce();
		});

		it("should update the real PostGIS location point after creating the job", async () => {
			await repository.create({ data: createParams, locationPoint: { latitude: -23.55052, longitude: -46.633308 } });

			expect(executeRaw).toHaveBeenCalledOnce();
		});
	});

	describe("findByIdLocalized", () => {
		it("should call prisma.job.findUnique with id and include category with translations for both locales", async () => {
			await repository.findByIdLocalized({ id: "cm3x-1234", locale: "es-MX" });

			expect(prisma.job.findUnique).toHaveBeenCalledWith({
				where: { id: "cm3x-1234" },
				include: {
					category: {
						include: {
							translations: {
								where: { locale: { in: ["es-MX", LocaleConstants.DEFAULT_LOCALE], mode: "insensitive" } },
							},
						},
					},
				},
			});
		});

		it("should return the job with categoryDisplayName from translation when found", async () => {
			const result = await repository.findByIdLocalized({ id: "cm3x-1234", locale: "es-MX" });

			expect(result).not.toBeNull();
			expect(result?.category.id).toBe("cm3x-cat-1");
			expect(result?.categoryDisplayName).toBe("Ayuda con mudanza");
		});

		it("should fall back to default locale translation when no translation matches requested locale", async () => {
			(prisma.job.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
				...mockJob,
				category: { ...mockJob.category, translations: [mockTranslations[0]] },
			});

			const result = await repository.findByIdLocalized({ id: "cm3x-1234", locale: "fr-FR" });

			expect(result).not.toBeNull();
			expect(result?.categoryDisplayName).toBe("Moving Help");
		});

		it("should return null when job is not found", async () => {
			(prisma.job.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

			const result = await repository.findByIdLocalized({ id: "nonexistent", locale: "en-US" });

			expect(result).toBeNull();
		});

		it("should strip translations from the returned category object", async () => {
			const result = await repository.findByIdLocalized({ id: "cm3x-1234", locale: "es-MX" });

			expect(result).not.toBeNull();
			expect((result?.category as Record<string, unknown>)["translations"]).toBeUndefined();
		});
	});

	describe("updateDescriptionSummary", () => {
		it("should call prisma.job.update with correct jobId and summary", async () => {
			await repository.updateDescriptionSummary({ jobId: "cm3x-1234", summary: "Test summary sentence here" });

			expect(prisma.job.update).toHaveBeenCalledWith({
				where: { id: "cm3x-1234" },
				data: { descriptionSummary: "Test summary sentence here" },
			});
		});

		it("should not throw when update succeeds", async () => {
			await expect(
				repository.updateDescriptionSummary({ jobId: "cm3x-1234", summary: "Test" }),
			).resolves.toBeUndefined();
		});
	});
});
