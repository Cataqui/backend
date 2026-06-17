/* eslint-disable @typescript-eslint/unbound-method */

import { HEADERS_METADATA } from "@nestjs/common/constants";
import { Test } from "@nestjs/testing";
import { MapConfigRequestQueryDto } from "./dto/map-config-request-query.dto";
import { MapController } from "./map.controller";
import { MapService } from "./map.service";
import { MapAuthConstants } from "./map-auth.constants";

describe("MapController", () => {
	let controller: MapController;
	let mapService: MapService;

	beforeEach(async () => {
		mapService = {
			getConfig: vi.fn(),
		} as unknown as MapService;

		const module = await Test.createTestingModule({
			controllers: [MapController],
			providers: [{ provide: MapService, useValue: mapService }],
		}).compile();

		controller = module.get(MapController);
	});

	describe("getConfig", () => {
		it("should set Cache-Control header with public max-age matching AUTH_EXPIRATION_SECONDS", () => {
			const headers = Reflect.getMetadata(HEADERS_METADATA, MapController.prototype.getConfig) as {
				name: string;
				value: string;
			}[];

			expect(headers).toBeDefined();
			expect(headers).toContainEqual({
				name: "Cache-Control",
				value: `public, max-age=${MapAuthConstants.AUTH_EXPIRATION_SECONDS}`,
			});
		});

		it("should call MapService.getConfig with the region from query", async () => {
			const query = Object.assign(new MapConfigRequestQueryDto(), { region: "BR" });
			const expectedResult = {
				queryParams: "v=1&sig=abc&exp=123",
				expiresAt: "2026-01-01T00:00:00.000Z",
				mapVersion: "br",
			};
			(mapService.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue(expectedResult);

			const result = await controller.getConfig(query);

			expect(mapService.getConfig).toHaveBeenCalledWith({ region: "BR" });
			expect(result).toEqual(expectedResult);
		});

		it("should return the result from MapService.getConfig", async () => {
			const query = Object.assign(new MapConfigRequestQueryDto(), { region: "US" });
			const expectedResult = {
				queryParams: "v=1&sig=def&exp=456",
				expiresAt: "2026-02-01T00:00:00.000Z",
				mapFileName: "us",
			};
			(mapService.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue(expectedResult);

			const result = await controller.getConfig(query);

			expect(result).toEqual(expectedResult);
		});
	});
});
