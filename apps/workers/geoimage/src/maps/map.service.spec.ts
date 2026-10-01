import { Jpeg } from "../../test/fakes";
import { GeoimageErrorCode } from "../geoimage-error-code.enum";
import { LandmarkCategory } from "../landmarks/landmark-category";
import type { LandmarkPlace } from "../landmarks/landmark-place.interface";
import { LandmarkRepository } from "../landmarks/landmark.repository";
import { MapRepository } from "./map.repository";
import { MapService } from "./map.service";

const _tall = {
	center: { latitude: -23.55, longitude: -46.63 },
	size: { width: 480, height: 1280 },
	density: 2,
} as const;
const _square = {
	center: { latitude: -23.55, longitude: -46.63 },
	size: { width: 480, height: 480 },
	density: 1,
} as const;
const _rendered = new Uint8Array([255, 216, 1, 2, 255, 217]);

function _service(params: { places?: LandmarkPlace[]; render?: () => Promise<Uint8Array> } = {}) {
	const repository = new MapRepository({ config: { apiKey: "test-key" } });
	const landmarks = new LandmarkRepository({ config: { apiKey: "test-key" } });
	const image = vi.spyOn(repository, "getImage").mockImplementation(async () => new Response(Jpeg).body!);
	const findPlaces = vi.spyOn(landmarks, "findPlaces").mockResolvedValue(params.places ?? []);
	const renderJpeg = vi.fn<(params: { svg: string }) => Promise<Uint8Array>>(params.render ?? (async () => _rendered));
	const service = new MapService({
		repository: () => repository,
		landmarks: () => landmarks,
		compositor: () => ({ renderJpeg: renderJpeg }),
	});
	return { service: service, image: image, findPlaces: findPlaces, renderJpeg: renderJpeg };
}

function _shoppingAtCenter(): LandmarkPlace {
	return {
		name: "Shopping Center",
		category: LandmarkCategory.SHOPPING_MALL,
		coordinates: { latitude: -23.551, longitude: -46.63 },
		notable: true,
	};
}

afterEach(() => vi.restoreAllMocks());

describe("MapService", () => {
	it("returns the provider image untouched when no known place is nearby", async () => {
		const { service, image, renderJpeg } = _service();
		expect(await service.generateImage(_tall)).toEqual(Jpeg);
		expect(image).toHaveBeenCalledExactlyOnceWith(_tall);
		expect(renderJpeg).not.toHaveBeenCalled();
	});

	it("draws known places onto the base map and returns the rendered image", async () => {
		const { service, renderJpeg } = _service({ places: [_shoppingAtCenter()] });
		expect(await service.generateImage(_tall)).toEqual(_rendered);
		const { svg } = renderJpeg.mock.calls[0]![0];
		expect(svg).toContain('width="960" height="2560"');
		expect(svg).toContain(">Shopping Center<");
		expect(svg).toContain("base64,/9j/2Q==");
	});

	it("looks for places only in the middle half that the app shows of a tall image", async () => {
		const { service, findPlaces } = _service();
		await service.generateImage(_tall);
		const { bounds } = findPlaces.mock.calls[0]![0];
		// 320 logical pixels at zoom 13 is about 5.1 km north and south of the center in São Paulo.
		expect(
			[bounds.north - _tall.center.latitude, _tall.center.latitude - bounds.south].map((value) => value.toFixed(3)),
		).toEqual(["0.050", "0.050"]);
		expect(
			[_tall.center.longitude - bounds.west, bounds.east - _tall.center.longitude].map((value) => value.toFixed(3)),
		).toEqual(["0.041", "0.041"]);
	});

	it("looks for places across the whole square image", async () => {
		const { service, findPlaces } = _service();
		await service.generateImage(_square);
		const { bounds } = findPlaces.mock.calls[0]![0];
		expect((bounds.north - bounds.south).toFixed(3)).toBe("0.076");
	});

	it("limits a square image to fewer pins than a tall one", async () => {
		const places = Array.from({ length: 12 }, (_, index) => ({
			..._shoppingAtCenter(),
			name: `Shopping ${index}`,
			coordinates: { latitude: -23.565 + index * 0.0028, longitude: -46.6 },
		}));
		const { service, renderJpeg } = _service({ places: places });
		await service.generateImage(_square);
		expect(renderJpeg.mock.calls[0]![0].svg.match(/<circle /g)).toHaveLength(5);
	});

	it("never stores an image without its pins when drawing fails", async () => {
		const { service } = _service({
			places: [_shoppingAtCenter()],
			render: async () => {
				throw new Error("wasm trap");
			},
		});
		await expect(service.generateImage(_tall)).rejects.toMatchObject({ errorCode: GeoimageErrorCode.INTERNAL_ERROR });
	});

	it("fails the generation when places cannot be loaded", async () => {
		const { service, findPlaces } = _service();
		findPlaces.mockRejectedValue(new Error("provider down"));
		await expect(service.generateImage(_tall)).rejects.toThrow("provider down");
	});

	it("rejects once without unhandled rejections when both providers lack credentials", async () => {
		const unhandled = vi.fn();
		process.on("unhandledRejection", unhandled);
		const service = new MapService({
			repository: () => {
				throw new Error("missing map key");
			},
			landmarks: () => {
				throw new Error("missing places key");
			},
			compositor: () => ({ renderJpeg: async () => _rendered }),
		});
		try {
			await expect(service.generateImage(_tall)).rejects.toThrow("missing map key");
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(unhandled).not.toHaveBeenCalled();
		} finally {
			process.off("unhandledRejection", unhandled);
		}
	});
});
