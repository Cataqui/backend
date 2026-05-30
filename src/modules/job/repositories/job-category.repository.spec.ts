/* eslint-disable @typescript-eslint/unbound-method */
import { Test } from "@nestjs/testing";
import { JobCategoryRepository } from "./job-category.repository";
import { PrismaService } from "../../../core/prisma/prisma.service";

const mockCategory = { id: "cm3x-cat-1", name: "Moving Help", slug: "moving-help", createdAt: new Date(), updatedAt: new Date() };

const mockTranslation = {
	id: "cm3x-trans-1",
	categoryId: "cm3x-cat-1",
	locale: "es-MX",
	name: "Ayuda con mudanza",
	createdAt: new Date("2026-05-28T10:00:00.000Z"),
	updatedAt: new Date("2026-05-28T10:00:00.000Z"),
};

describe("JobCategoryRepository", () => {
	let repository: JobCategoryRepository;
	let prisma: PrismaService;

	beforeEach(async () => {
		prisma = {
			jobCategory: {
				findUnique: vi.fn().mockResolvedValue({ ...mockCategory, translations: [mockTranslation] }),
			},
		} as unknown as PrismaService;

		const module = await Test.createTestingModule({
			providers: [JobCategoryRepository, { provide: PrismaService, useValue: prisma }],
		}).compile();

		repository = module.get(JobCategoryRepository);
	});

	describe("findByIdWithLocalizedName", () => {
		it("should return category with translated name when translation exists", async () => {
			const result = await repository.findByIdWithLocalizedName({ id: "cm3x-cat-1", locale: "es-MX" });

			expect(result).toEqual({
				id: "cm3x-cat-1",
				slug: "moving-help",
				displayName: "Ayuda con mudanza",
			});
		});

		it("should return category with base name when no translation exists", async () => {
			(prisma.jobCategory.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ ...mockCategory, translations: [] });

			const result = await repository.findByIdWithLocalizedName({ id: "cm3x-cat-1", locale: "fr-FR" });

			expect(result).toEqual({
				id: "cm3x-cat-1",
				slug: "moving-help",
				displayName: "Moving Help",
			});
		});

		it("should return null when category does not exist", async () => {
			(prisma.jobCategory.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

			const result = await repository.findByIdWithLocalizedName({ id: "non-existent", locale: "es-MX" });

			expect(result).toBeNull();
		});

		it("should call findUnique with translations filtered by locale", async () => {
			const findUniqueMock = prisma.jobCategory.findUnique as ReturnType<typeof vi.fn>;

			await repository.findByIdWithLocalizedName({ id: "cm3x-cat-1", locale: "pt-BR" });

			expect(findUniqueMock).toHaveBeenCalledWith({
				where: { id: "cm3x-cat-1" },
				include: {
					translations: {
						where: { locale: "pt-BR" },
						take: 1,
					},
				},
			});
		});
	});
});
