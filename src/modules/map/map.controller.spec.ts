/* eslint-disable @typescript-eslint/unbound-method */
import { Test } from "@nestjs/testing";
import { MapController } from "./map.controller";
import { MapService } from "./map.service";
import { MapAuthenticateRequestDto } from "./dto/map-authenticate-request.dto";

describe("MapController", () => {
	let controller: MapController;
	let mapService: MapService;

	beforeEach(async () => {
		mapService = {
			authenticate: vi.fn(),
		} as unknown as MapService;

		const module = await Test.createTestingModule({
			controllers: [MapController],
			providers: [{ provide: MapService, useValue: mapService }],
		}).compile();

		controller = module.get(MapController);
	});

	describe("authenticate", () => {
		it("should call MapService.authenticate with the region from DTO", async () => {
			const dto = Object.assign(new MapAuthenticateRequestDto(), { region: "BR" });
			const expectedResult = { queryParams: "v=1&sig=abc&exp=123", expiresAt: "2026-01-01T00:00:00.000Z", mapVersion: "br" };
			(mapService.authenticate as ReturnType<typeof vi.fn>).mockResolvedValue(expectedResult);

			const result = await controller.authenticate(dto);

			expect(mapService.authenticate).toHaveBeenCalledWith({ region: "BR" });
			expect(result).toEqual(expectedResult);
		});

		it("should return the result from MapService.authenticate", async () => {
			const dto = Object.assign(new MapAuthenticateRequestDto(), { region: "US" });
			const expectedResult = { queryParams: "v=1&sig=def&exp=456", expiresAt: "2026-02-01T00:00:00.000Z", mapFileName: "us" };
			(mapService.authenticate as ReturnType<typeof vi.fn>).mockResolvedValue(expectedResult);

			const result = await controller.authenticate(dto);

			expect(result).toEqual(expectedResult);
		});
	});
});
