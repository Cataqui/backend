import { PlacesRepository } from "../src/modules/places/places.repository";
import { PlacesService } from "../src/modules/places/places.service";
import { PlaceCategory } from "../src/modules/places/place-category";
import { StaticService } from "../src/modules/static/static.service";
import { StaticRepository } from "../src/modules/static/static.repository";
import { LandmarkService } from "../src/modules/static/landmarks/landmark.service";
import { getStaticGenerationIdentity, getStaticIdentity } from "../src/modules/static/static-identity";
import { LandmarkStyle } from "../src/modules/static/landmarks/landmark-style";
import type { Landmark } from "../src/modules/static/landmarks/landmark.interface";
import { LandmarkLabelPosition } from "../src/modules/static/landmarks/landmark-label-position.enum";

// A flat gray 240x160 PNG; pins add visible color and label detail to this fixture.
const _base = Uint8Array.from(
	atob(
		"iVBORw0KGgoAAAANSUhEUgAAAPAAAACgCAIAAAC9uXYyAAABwUlEQVR4nO3SQQkAMAzAwPq3WhM1MRiEOwV5ZBZC5ncAvGRoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQcZ7MuNLlFx/4AAAAASUVORK5CYII=",
	),
	(character) => character.charCodeAt(0),
);

afterEach(() => vi.restoreAllMocks());

it("renders PNG base maps with pins through StaticService at 2x density before WebP encoding", async () => {
	const input = {
		baseImage: _base,
		landmarks: [
			{
				label: "Shopping",
				category: PlaceCategory.SHOPPING_MALL,
				x: 30,
				y: 40,
				labelPosition: LandmarkLabelPosition.RIGHT,
			},
			{
				label: "Madero",
				category: PlaceCategory.RESTAURANT,
				x: 90,
				y: 60,
				labelPosition: LandmarkLabelPosition.LEFT,
			},
			{
				label: "Sé",
				category: PlaceCategory.PLACE_OF_WORSHIP,
				x: 60,
				y: 20,
				labelPosition: LandmarkLabelPosition.RIGHT,
			},
		] satisfies Landmark[],
		size: { width: 480, height: 480 },
		density: 2,
	};
	const coordinates = { latitude: -23.55, longitude: -46.63 };
	const missingId = await getStaticIdentity({
		assetId: await getStaticGenerationIdentity({ input: coordinates, environment: "staging" }),
		size: input.size,
		scale: input.density,
		zoom: 13,
	});
	const repository = new StaticRepository({
		bucket: { head: vi.fn(), put: vi.fn(), get: vi.fn() },
		images: { input: vi.fn(), info: vi.fn() },
		generation: { getByName: vi.fn() },
		staticConfig: { geoapifyApiKey: "test", environment: "development", baseUrl: "https://maps.test" },
	});
	vi.spyOn(repository, "findImage").mockImplementation(async (params) => !params.key.endsWith(`${missingId}.webp`));
	vi.spyOn(repository, "generateImage").mockResolvedValue(input.baseImage);
	vi.spyOn(repository, "upload").mockResolvedValue(undefined);
	const encode = vi.spyOn(repository, "encode").mockImplementation(async (params) => params.bytes);
	const landmarks = new LandmarkService({
		places: new PlacesService({
			repository: new PlacesRepository({
				placesConfig: { googlePlacesApiKey: "test", geoapifyApiKey: "test-geoapify" },
				searchRateLimiter: { limit: vi.fn() },
				detailsRateLimiter: { limit: vi.fn() },
			}),
		}),
	});
	vi.spyOn(landmarks, "getLandmarks").mockResolvedValue([...input.landmarks]);
	const service = new StaticService({
		repository: repository,
		landmarks: landmarks,
		staticConfig: { geoapifyApiKey: "test", environment: "staging", baseUrl: "https://maps.test" },
	});
	const prepare = async () => {
		encode.mockClear();
		const operation = service.startPreparation(coordinates);
		expect(await operation.result).toMatchObject({ kind: "ready" });
		await operation.settled;
		expect(encode).toHaveBeenCalledOnce();
		return encode.mock.calls[0]![0].bytes;
	};
	const first = await prepare();
	const second = await prepare();
	let withoutTracking: Uint8Array;
	Object.defineProperty(LandmarkStyle, "labelLetterSpacing", { value: 0 });
	try {
		withoutTracking = await prepare();
	} finally {
		Object.defineProperty(LandmarkStyle, "labelLetterSpacing", { value: -0.2 });
	}

	expect(Array.from(first.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
	const header = new DataView(first.buffer, first.byteOffset, first.byteLength);
	expect({ width: header.getUint32(16), height: header.getUint32(20) }).toEqual({ width: 960, height: 960 });
	expect(second).toEqual(first);
	expect(withoutTracking).not.toEqual(first);
	expect(first.length).toBeGreaterThan(_base.length * 1.5);
});
