import { Test } from "@nestjs/testing";
import { MAP_AUTH_CONFIG_KEY } from "../../core/config/map-auth.config";
import { MapConfigOutputDto } from "./dto/map-config-output.dto";
import { MapRegionNotFoundError } from "./errors/map-region-not-found.error";
import { MapService } from "./map.service";
import { MapAuthConstants } from "./map-auth.constants";
import { MapVersionRepository } from "./repositories/map-version.repository";

const MOCK_AUTH_SECRET = "test-secret-123";

/* eslint-disable @typescript-eslint/unbound-method */

describe("MapService", () => {
	let service: MapService;
	let mapVersionRepository: MapVersionRepository;

	beforeEach(async () => {
		mapVersionRepository = {
			findByRegionCode: vi.fn(),
		} as unknown as MapVersionRepository;

		const module = await Test.createTestingModule({
			providers: [
				MapService,
				{
					provide: MAP_AUTH_CONFIG_KEY,
					useValue: { authSecret: MOCK_AUTH_SECRET, protomapUrl: "https://tiles.cataqui.com" },
				},
				{ provide: MapVersionRepository, useValue: mapVersionRepository },
			],
		}).compile();

		service = module.get(MapService);
	});

	describe("getConfig", () => {
		it("should return MapConfigOutputDto when region exists", async () => {
			(mapVersionRepository.findByRegionCode as ReturnType<typeof vi.fn>).mockResolvedValue({
				id: "uuid-1",
				regionCode: "BR",
				mapFileName: "br",
				fontstack: "inter",
			});

			const result = await service.getConfig({ region: "BR" });

			expect(result).toBeInstanceOf(MapConfigOutputDto);
			expect(result.mapVersion).toBe("br");
		});

		it("should set fontstack from repository value", async () => {
			(mapVersionRepository.findByRegionCode as ReturnType<typeof vi.fn>).mockResolvedValue({
				id: "uuid-1",
				regionCode: "BR",
				mapFileName: "br",
				fontstack: "noto-sans",
			});

			const result = await service.getConfig({ region: "BR" });

			expect(result.fontstack).toBe("noto-sans");
		});

		it("should throw MapRegionNotFoundError when region does not exist", async () => {
			(mapVersionRepository.findByRegionCode as ReturnType<typeof vi.fn>).mockResolvedValue(null);

			await expect(service.getConfig({ region: "XX" })).rejects.toThrow(MapRegionNotFoundError);
		});

		it("should normalize region to uppercase", async () => {
			(mapVersionRepository.findByRegionCode as ReturnType<typeof vi.fn>).mockResolvedValue({
				id: "uuid-1",
				regionCode: "BR",
				mapFileName: "br",
				fontstack: "inter",
			});

			await service.getConfig({ region: "br" });

			expect(mapVersionRepository.findByRegionCode).toHaveBeenCalledWith({ regionCode: "BR" });
		});

		it("should set query_params with correct format", async () => {
			(mapVersionRepository.findByRegionCode as ReturnType<typeof vi.fn>).mockResolvedValue({
				id: "uuid-1",
				regionCode: "BR",
				mapFileName: "br",
				fontstack: "inter",
			});

			const result = await service.getConfig({ region: "BR" });

			expect(result.queryParams).toMatch(/^v=1&sig=[a-f0-9]+&exp=\d+$/);
		});

		it("should set expires_at approximately 1 hour from now", async () => {
			(mapVersionRepository.findByRegionCode as ReturnType<typeof vi.fn>).mockResolvedValue({
				id: "uuid-1",
				regionCode: "BR",
				mapFileName: "br",
				fontstack: "inter",
			});

			const before = Date.now() + MapAuthConstants.AUTH_EXPIRATION_SECONDS * 1000 - 1000;
			const after = Date.now() + MapAuthConstants.AUTH_EXPIRATION_SECONDS * 1000 + 1000;

			const result = await service.getConfig({ region: "BR" });

			const expiresAtMs = new Date(result.expiresAt).getTime();
			expect(expiresAtMs).toBeGreaterThanOrEqual(before);
			expect(expiresAtMs).toBeLessThanOrEqual(after);
		});

		it("should call findByRegionCode with correct regionCode", async () => {
			(mapVersionRepository.findByRegionCode as ReturnType<typeof vi.fn>).mockResolvedValue({
				id: "uuid-1",
				regionCode: "BR",
				mapFileName: "br",
				fontstack: "inter",
			});

			await service.getConfig({ region: "BR" });

			expect(mapVersionRepository.findByRegionCode).toHaveBeenCalledWith({ regionCode: "BR" });
		});

		it("should set tilesUrlTemplate with correct format", async () => {
			(mapVersionRepository.findByRegionCode as ReturnType<typeof vi.fn>).mockResolvedValue({
				id: "uuid-1",
				regionCode: "BR",
				mapFileName: "2026-06-09",
				fontstack: "inter",
			});

			const result = await service.getConfig({ region: "BR" });

			expect(result.tilesUrlTemplate).toBe("https://tiles.cataqui.com/regions/br/2026-06-09/{z}/{x}/{y}.mvt");
		});

		it("should use lowercase region in tilesUrlTemplate", async () => {
			(mapVersionRepository.findByRegionCode as ReturnType<typeof vi.fn>).mockResolvedValue({
				id: "uuid-1",
				regionCode: "US",
				mapFileName: "2026-06-09",
				fontstack: "inter",
			});

			const result = await service.getConfig({ region: "US" });

			expect(result.tilesUrlTemplate).toMatch(/^https:\/\/tiles\.cataqui\.com\/regions\/us\//);
		});

		it("should use mapFileName as version segment in tilesUrlTemplate", async () => {
			(mapVersionRepository.findByRegionCode as ReturnType<typeof vi.fn>).mockResolvedValue({
				id: "uuid-1",
				regionCode: "BR",
				mapFileName: "2026-06-10",
				fontstack: "inter",
			});

			const result = await service.getConfig({ region: "BR" });

			expect(result.tilesUrlTemplate).toContain("/br/2026-06-10/");
		});

		it("should set glyphUrlTemplate with correct format", async () => {
			(mapVersionRepository.findByRegionCode as ReturnType<typeof vi.fn>).mockResolvedValue({
				id: "uuid-1",
				regionCode: "BR",
				mapFileName: "2026-06-09",
				fontstack: "inter",
			});

			const result = await service.getConfig({ region: "BR" });

			expect(result.glyphUrlTemplate).toBe("https://tiles.cataqui.com/glyphs/{fontstack}/{range}.pbf");
		});
	});
});
