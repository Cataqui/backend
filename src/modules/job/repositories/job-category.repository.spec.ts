/* eslint-disable @typescript-eslint/unbound-method */
import { Test } from "@nestjs/testing";
import { JobCategoryRepository } from "./job-category.repository";
import { PrismaService } from "../../../shared/prisma/prisma.service";

const mockCategory = { id: "cm3x-cat-1", name: "Moving Help", slug: "moving-help", createdAt: new Date(), updatedAt: new Date() };

describe("JobCategoryRepository", () => {
	let repository: JobCategoryRepository;
	let prisma: PrismaService;

	beforeEach(async () => {
		prisma = {
			jobCategory: {
				findUnique: vi.fn().mockResolvedValue(mockCategory),
			},
		} as unknown as PrismaService;

		const module = await Test.createTestingModule({
			providers: [JobCategoryRepository, { provide: PrismaService, useValue: prisma }],
		}).compile();

		repository = module.get(JobCategoryRepository);
	});

	describe("findById", () => {
		it("should return a category when found", async () => {
			const result = await repository.findById({ id: "cm3x-cat-1" });

			expect(result).toEqual(mockCategory);
		});

		it("should return null when category does not exist", async () => {
			const findUniqueMock = prisma.jobCategory.findUnique as ReturnType<typeof vi.fn>;
			findUniqueMock.mockResolvedValue(null);

			const result = await repository.findById({ id: "non-existent" });

			expect(result).toBeNull();
		});

		it("should call findUnique with the given id", async () => {
			const findUniqueMock = prisma.jobCategory.findUnique as ReturnType<typeof vi.fn>;

			await repository.findById({ id: "cm3x-cat-1" });

			expect(findUniqueMock).toHaveBeenCalledWith({ where: { id: "cm3x-cat-1" } });
		});
	});
});
