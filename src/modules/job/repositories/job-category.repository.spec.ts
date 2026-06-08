/* eslint-disable @typescript-eslint/unbound-method */
import { Test } from "@nestjs/testing";
import { JobCategoryRepository } from "./job-category.repository";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { LocaleConstants } from "../../../shared/locale/locale.constants";

const mockCategory = { id: "cm3x-cat-1", slug: "moving-help", createdAt: new Date(), updatedAt: new Date() };

const mockTranslations = [
	{
		id: "cm3x-trans-en",
		categoryId: "cm3x-cat-1",
		locale: LocaleConstants.DEFAULT_LOCALE,
		name: "Moving Help",
		createdAt: new Date("2026-05-28T10:00:00.000Z"),
		updatedAt: new Date("2026-05-28T10:00:00.000Z"),
	},
	{
		id: "cm3x-trans-es",
		categoryId: "cm3x-cat-1",
		locale: "es-MX",
		name: "Ayuda con mudanza",
		createdAt: new Date("2026-05-28T10:00:00.000Z"),
		updatedAt: new Date("2026-05-28T10:00:00.000Z"),
	},
];

describe("JobCategoryRepository", () => {
	let repository: JobCategoryRepository;
	let prisma: PrismaService;

	beforeEach(async () => {
		prisma = {
			jobCategory: {
				findUnique: vi.fn().mockResolvedValue({ ...mockCategory, translations: mockTranslations }),
			},
		} as unknown as PrismaService;

		const module = await Test.createTestingModule({
			providers: [JobCategoryRepository, { provide: PrismaService, useValue: prisma }],
		}).compile();

		repository = module.get(JobCategoryRepository);
	});

	describe("findByIdWithLocalizedName", () => {
		it("should return category with translated name when translation exists for requested locale", async () => {
			const result = await repository.findByIdWithLocalizedName({ id: "cm3x-cat-1", locale: "es-MX" });

			expect(result).toEqual({
				id: "cm3x-cat-1",
				slug: "moving-help",
				displayName: "Ayuda con mudanza",
			});
		});

		it("should fall back to default locale translation when no translation exists for requested locale", async () => {
			(prisma.jobCategory.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
				...mockCategory,
				translations: [mockTranslations[0]],
			});

			const result = await repository.findByIdWithLocalizedName({ id: "cm3x-cat-1", locale: "fr-FR" });

			expect(result).toEqual({
				id: "cm3x-cat-1",
				slug: "moving-help",
				displayName: "Moving Help",
			});
		});

		it("should fall back to first available translation when neither requested nor default locale exists", async () => {
			(prisma.jobCategory.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
				...mockCategory,
				translations: [{ ...mockTranslations[1], locale: "fr-FR" }],
			});

			const result = await repository.findByIdWithLocalizedName({ id: "cm3x-cat-1", locale: "pt-BR" });

			expect(result).toEqual({
				id: "cm3x-cat-1",
				slug: "moving-help",
				displayName: "Ayuda con mudanza",
			});
		});

		it("should return null when category does not exist", async () => {
			(prisma.jobCategory.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

			const result = await repository.findByIdWithLocalizedName({ id: "non-existent", locale: "es-MX" });

			expect(result).toBeNull();
		});

		it("should call findUnique with translations filtered by requested locale and default locale", async () => {
			const findUniqueMock = prisma.jobCategory.findUnique as ReturnType<typeof vi.fn>;

			await repository.findByIdWithLocalizedName({ id: "cm3x-cat-1", locale: "pt-BR" });

			expect(findUniqueMock).toHaveBeenCalledWith({
				where: { id: "cm3x-cat-1" },
				include: {
					translations: {
						where: { locale: { in: ["pt-BR", LocaleConstants.DEFAULT_LOCALE] } },
					},
				},
			});
		});
	});
});
