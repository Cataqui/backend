/* eslint-disable @typescript-eslint/unbound-method */
import { Test } from "@nestjs/testing";
import { MapVersionRepository } from "./map-version.repository";
import { PrismaService } from "../../../core/prisma/prisma.service";

describe("MapVersionRepository", () => {
	let repository: MapVersionRepository;
	let prismaService: PrismaService;

	beforeEach(async () => {
		prismaService = {
			mapVersion: {
				findUnique: vi.fn(),
			},
		} as unknown as PrismaService;

		const module = await Test.createTestingModule({
			providers: [MapVersionRepository, { provide: PrismaService, useValue: prismaService }],
		}).compile();

		repository = module.get(MapVersionRepository);
	});

	describe("findByRegionCode", () => {
		it("should return map version when found", async () => {
			const mockRecord = { id: "uuid-1", regionCode: "BR", mapFileName: "br" };
			(prismaService.mapVersion.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockRecord);

			const result = await repository.findByRegionCode({ regionCode: "BR" });

			expect(result).toEqual(mockRecord);
		});

		it("should return null when not found", async () => {
			(prismaService.mapVersion.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

			const result = await repository.findByRegionCode({ regionCode: "XX" });

			expect(result).toBeNull();
		});

		it("should query by regionCode", async () => {
			(prismaService.mapVersion.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

			await repository.findByRegionCode({ regionCode: "MX" });

			expect(prismaService.mapVersion.findUnique).toHaveBeenCalledWith({
				where: { regionCode: "MX" },
				select: { id: true, regionCode: true, mapFileName: true },
			});
		});
	});
});
