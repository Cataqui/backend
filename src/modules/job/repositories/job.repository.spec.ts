import { Test } from "@nestjs/testing";
import { JobRepository } from "./job.repository";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import type { Prisma } from "../../../../generated/prisma/client.js";

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
	contactName: string;
	contactPhoneNumber: string;
	contactMethod: string;
	street: string | null;
	neighborhood: string | null;
	city: string;
	state: string;
	country: string;
	status: string;
	type: string;
	paymentType: string;
	paymentMinAmount: { toNumber(): number } | null;
	paymentMaxAmount: { toNumber(): number } | null;
	paymentNote: string | null;
	paymentRecurrence: string;
	paymentCurrency: string;
	categoryId: string;
	createdAt: Date;
	updatedAt: Date;
	category: MockCategoryWithTranslations;
}

const mockJob: MockJobWithCategory = {
	id: "cm3x-1234",
	title: "Help unload truck",
	description: "Need someone to help.",
	contactName: "João Silva",
	contactPhoneNumber: "+5511999999999",
	contactMethod: "WHATSAPP",
	street: "Rua das Flores, 123",
	neighborhood: "Centro",
	city: "São Paulo",
	state: "SP",
	country: "BR",
	status: "ACTIVE",
	type: "TASK",
	paymentType: "FIXED",
	paymentMinAmount: { toNumber: (): number => 150.0 },
	paymentMaxAmount: null,
	paymentNote: null,
	paymentRecurrence: "SINGLE",
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
		translations: [{ id: "t1", name: "Ayuda con mudanza", locale: "es-MX" }],
	},
};

const createParams: Prisma.JobUncheckedCreateInput = {
	title: "Help unload truck",
	description: "Need someone to help.",
	status: "ACTIVE",
	contactName: "João Silva",
	contactPhoneNumber: "+5511999999999",
	contactMethod: "WHATSAPP",
	street: "Rua das Flores, 123",
	neighborhood: "Centro",
	city: "São Paulo",
	state: "SP",
	country: "BR",
	type: "TASK",
	paymentType: "FIXED",
	paymentMinAmount: 150.0,
	paymentMaxAmount: null,
	paymentNote: null,
	paymentRecurrence: "SINGLE",
	paymentCurrency: "BRL",
	categoryId: "cm3x-cat-1",
};

describe("JobRepository", () => {
	let repository: JobRepository;
	let prisma: PrismaService;

	beforeEach(async () => {
		prisma = {
			job: {
				create: vi.fn<(...args: unknown[]) => MockJobWithCategory>().mockReturnValue(mockJob),
				findUnique: vi.fn<(...args: unknown[]) => MockJobWithCategory | null>().mockResolvedValue(mockJob),
			},
		} as unknown as PrismaService;

		const module = await Test.createTestingModule({
			providers: [JobRepository, { provide: PrismaService, useValue: prisma }],
		}).compile();

		repository = module.get(JobRepository);
	});

	describe("create", () => {
		it("should call prisma.job.create with flattened data and include category", async () => {
			await repository.create({ data: createParams });

			expect(prisma.job.create).toHaveBeenCalledWith({
				data: {
					title: "Help unload truck",
					description: "Need someone to help.",
					status: "ACTIVE",
					contactName: "João Silva",
					contactPhoneNumber: "+5511999999999",
					contactMethod: "WHATSAPP",
					street: "Rua das Flores, 123",
					neighborhood: "Centro",
					city: "São Paulo",
					state: "SP",
					country: "BR",
					type: "TASK",
					paymentType: "FIXED",
					paymentMinAmount: 150.0,
					paymentMaxAmount: null,
					paymentNote: null,
					paymentRecurrence: "SINGLE",
					paymentCurrency: "BRL",
					categoryId: "cm3x-cat-1",
				},
				include: { category: true },
			});
		});

		it("should return the created job with category", async () => {
			const result = await repository.create({ data: createParams });

			expect(result).toEqual(mockJob);
			expect(result.category).toBeDefined();
			expect(result.category.name).toBe("Moving Help");
		});

		it("should convert nullish street to null", async () => {
			const params = { ...createParams, street: undefined as unknown as string | null, neighborhood: null as unknown as string | null };
			await repository.create({ data: params });

			const callData = (prisma.job.create as ReturnType<typeof vi.fn>).mock.calls[1]?.[0]?.data;

			if (callData) {
				expect(callData.street).toBeNull();
				expect(callData.neighborhood).toBeNull();
			}
		});
	});

	describe("findByIdLocalized", () => {
		it("should call prisma.job.findUnique with id and include category with translations", async () => {
			await repository.findByIdLocalized({ id: "cm3x-1234", locale: "es-MX" });

			expect(prisma.job.findUnique).toHaveBeenCalledWith({
				where: { id: "cm3x-1234" },
				include: {
					category: {
						include: {
							translations: {
								where: { locale: "es-MX" },
								take: 1,
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
			expect(result?.category.name).toBe("Moving Help");
			expect(result?.categoryDisplayName).toBe("Ayuda con mudanza");
		});

		it("should fall back to base category name when no translation matches locale", async () => {
			(prisma.job.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
				...mockJob,
				category: { ...mockJob.category, translations: [] },
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
});
