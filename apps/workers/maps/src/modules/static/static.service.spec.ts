import { PlacesRepository } from "../places/places.repository";
import { PlacesService } from "../places/places.service";
import type { Landmark } from "./landmarks/landmark.interface";
import { PlaceCategory } from "../places/place-category";
import { LandmarkLabelPosition } from "./landmarks/landmark-label-position.enum";
import { Resvg } from "@resvg/resvg-wasm";
import { LandmarkService } from "./landmarks/landmark.service";
import { StaticService } from "./static.service";
import { StaticRepository } from "./static.repository";
import { MapsError } from "../../shared/maps.error";
import { MapsErrorCode } from "../../shared/maps-error-code.enum";
import { getStaticGenerationIdentity, getStaticIdentity } from "./static-identity";

const input = { latitude: -23.5, longitude: -46.6 };
const generate = vi.fn();
const getByName = vi.fn().mockReturnValue({ generate: generate });
let repository: StaticRepository;
let landmarks: LandmarkService;
let service: StaticService;
const _rendering = vi.hoisted(() => ({
	png: vi.fn(() => new Uint8Array([3])),
	freeImage: vi.fn(),
	freeRasterizer: vi.fn(),
	render: vi.fn(),
}));
vi.mock("@resvg/resvg-wasm", () => ({
	initWasm: vi.fn(async () => undefined),
	Resvg: vi.fn(
		class {
			render = _rendering.render;
			free = _rendering.freeRasterizer;
		},
	),
}));

beforeEach(async () => {
	vi.useFakeTimers();
	vi.spyOn(Math, "random").mockReturnValue(0);
	getByName.mockReturnValue({ generate: generate });
	repository = new StaticRepository({
		bucket: { head: vi.fn(), put: vi.fn(), get: vi.fn() },
		images: { input: vi.fn(), info: vi.fn() },
		generation: { getByName: getByName },
		staticConfig: { geoapifyApiKey: "test", environment: "development", baseUrl: "https://maps.test" },
	});
	// Exercise one missing variant so attempt counts describe one generation stage.
	const missingId = await getStaticIdentity({
		assetId: await getStaticGenerationIdentity({ input: input, environment: "development" }),
		size: { width: 480, height: 480 },
		scale: 2,
		zoom: 13,
	});
	vi.spyOn(repository, "findImage").mockImplementation(async (params) => !params.key.endsWith(`${missingId}.webp`));
	vi.spyOn(repository, "generateImage").mockResolvedValue(new Uint8Array([1]));
	vi.spyOn(repository, "encode").mockResolvedValue(new Uint8Array([2]));
	vi.spyOn(repository, "upload").mockResolvedValue(undefined);
	vi.spyOn(PlacesRepository.prototype, "searchPlacesInArea").mockResolvedValue([]);
	landmarks = new LandmarkService({
		places: new PlacesService({
			repository: new PlacesRepository({
				placesConfig: { googlePlacesApiKey: "test", geoapifyApiKey: "test-geoapify" },
				searchRateLimiter: { limit: vi.fn() },
				detailsRateLimiter: { limit: vi.fn() },
			}),
		}),
	});
	_rendering.render.mockReturnValue({ asPng: _rendering.png, free: _rendering.freeImage });
	service = new StaticService({
		repository: repository,
		landmarks: landmarks,
		staticConfig: { geoapifyApiKey: "test", environment: "development", baseUrl: "https://maps.test" },
	});
});
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.clearAllMocks();
});

it("routes coordinate-only calls to the map-set coordinator", async () => {
	generate.mockResolvedValue({
		kind: "ready",
		asset: { id: "a".repeat(64), url: `https://maps.test/static/${"a".repeat(64)}` },
	});
	await service.generate(input);
	expect({ coordinator: getByName.mock.calls, generation: generate.mock.calls }).toEqual({
		coordinator: [[await getStaticGenerationIdentity({ input: input, environment: "development" })]],
		generation: [[input]],
	});
});

it("retries a failed download at one and two seconds with at most three attempts", async () => {
	const started = Promise.withResolvers<void>();
	vi.mocked(repository.generateImage).mockImplementation(async () => {
		started.resolve();
		throw new MapsError({ errorCode: MapsErrorCode.PROVIDER_UNAVAILABLE, retryable: true });
	});
	const operation = service.startPreparation(input);
	await started.promise;
	await vi.advanceTimersByTimeAsync(0);
	await vi.advanceTimersByTimeAsync(999);
	expect(repository.generateImage).toHaveBeenCalledTimes(1);
	await vi.advanceTimersByTimeAsync(1);
	expect(repository.generateImage).toHaveBeenCalledTimes(2);
	await vi.advanceTimersByTimeAsync(1999);
	expect(repository.generateImage).toHaveBeenCalledTimes(2);
	await vi.advanceTimersByTimeAsync(1);
	expect(repository.generateImage).toHaveBeenCalledTimes(3);
	expect(await operation.result).toEqual({ kind: "failed", code: "PROVIDER_UNAVAILABLE", retryable: true });
	await operation.settled;
	expect(repository.encode).not.toHaveBeenCalled();
});

it("adds jitter after provider Retry-After and never retries early", async () => {
	vi.mocked(Math.random).mockReturnValue(0.999);
	const started = Promise.withResolvers<void>();
	vi.mocked(repository.generateImage).mockImplementationOnce(async () => {
		started.resolve();
		throw new MapsError({ errorCode: MapsErrorCode.PROVIDER_UNAVAILABLE, retryable: true, retryAfterMs: 3000 });
	});
	const operation = service.startPreparation(input);
	await started.promise;
	await vi.advanceTimersByTimeAsync(0);
	await vi.advanceTimersByTimeAsync(3249);
	expect(repository.generateImage).toHaveBeenCalledOnce();
	await vi.advanceTimersByTimeAsync(1);
	expect(await operation.result).toMatchObject({ kind: "ready" });
	await operation.settled;
	expect(repository.generateImage).toHaveBeenCalledTimes(2);
});

it.each([new Error("unexpected"), new MapsError({ errorCode: MapsErrorCode.PROVIDER_UNAVAILABLE, retryable: false })])(
	"never retries terminal generation failures",
	async (error) => {
		vi.mocked(repository.generateImage).mockRejectedValue(error);
		const operation = service.startPreparation(input);
		expect(await operation.result).toMatchObject({ kind: "failed", retryable: false });
		await operation.settled;
		expect(repository.generateImage).toHaveBeenCalledOnce();
	},
);

it("does not shorten provider Retry-After to fit the generation budget", async () => {
	vi.mocked(repository.generateImage).mockRejectedValue(
		new MapsError({ errorCode: MapsErrorCode.PROVIDER_UNAVAILABLE, retryable: true, retryAfterMs: 40_000 }),
	);
	const operation = service.startPreparation(input);
	expect(await operation.result).toEqual({ kind: "failed", code: "PROVIDER_UNAVAILABLE", retryable: true });
	await operation.settled;
	expect(repository.generateImage).toHaveBeenCalledOnce();
});

it("shares the deadline across download and upload rather than restarting the budget", async () => {
	const download = Promise.withResolvers<Uint8Array>();
	vi.mocked(repository.generateImage).mockReturnValue(download.promise);
	vi.mocked(repository.upload).mockImplementation(async (params) => {
		if (params.height === 960) throw new MapsError({ errorCode: MapsErrorCode.STORAGE_UNAVAILABLE, retryable: true });
	});
	const operation = service.startPreparation(input);
	await vi.waitFor(() => expect(repository.generateImage).toHaveBeenCalledOnce());
	await vi.advanceTimersByTimeAsync(39_000);
	download.resolve(new Uint8Array([1]));
	expect(await operation.result).toEqual({ kind: "failed", code: "STORAGE_UNAVAILABLE", retryable: true });
	await operation.settled;
	expect(vi.mocked(repository.upload).mock.calls.filter(([params]) => params.height === 960)).toHaveLength(1);
});

it("returns a deadline failure while observing an uncancellable upload's late rejection", async () => {
	const upload = Promise.withResolvers<void>();
	vi.mocked(repository.upload).mockReturnValue(upload.promise);
	const operation = service.startPreparation(input);
	await vi.waitFor(() => expect(repository.upload).toHaveBeenCalledOnce());
	await vi.advanceTimersByTimeAsync(40_000);
	expect(await operation.result).toEqual({ kind: "failed", code: "PROVIDER_TIMEOUT", retryable: true });
	let settled = false;
	const cleanup = operation.settled.then(() => {
		settled = true;
	});
	await Promise.resolve();
	expect(settled).toBe(false);
	upload.reject(new Error("private late failure"));
	await cleanup;
	expect(settled).toBe(true);
	expect(repository.upload).toHaveBeenCalledOnce();
});

it("refuses another attempt when the deadline passes during a retry wait", async () => {
	vi.mocked(repository.generateImage).mockRejectedValue(
		new MapsError({ errorCode: MapsErrorCode.PROVIDER_UNAVAILABLE, retryable: true, retryAfterMs: 30_000 }),
	);
	const operation = service.startPreparation(input);
	await vi.waitFor(() => expect(repository.generateImage).toHaveBeenCalledOnce());
	// Advance wall time beyond the deadline before the retry timer gets to run.
	vi.setSystemTime(Date.now() + 40_000);
	await vi.advanceTimersByTimeAsync(30_000);
	expect(await operation.result).toEqual({ kind: "failed", code: "PROVIDER_TIMEOUT", retryable: true });
	await operation.settled;
	expect(repository.generateImage).toHaveBeenCalledOnce();
});

it("keeps preparation budgets independent when a service instance is reused", async () => {
	const first = service.startPreparation(input);
	expect(await first.result).toMatchObject({ kind: "ready" });
	await first.settled;
	const second = service.startPreparation(input);
	expect(await second.result).toMatchObject({ kind: "ready" });
	await second.settled;
});

it.each([true, false])("returns stored maps without public delivery requests when images exist: %s", async (exists) => {
	const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 404 }));
	vi.mocked(repository.findImage).mockResolvedValue(exists);
	const operation = service.startPreparation(input);
	expect(await operation.result).toMatchObject({ kind: "ready" });
	await operation.settled;
	expect(request).not.toHaveBeenCalled();
	expect(repository.upload).toHaveBeenCalledTimes(exists ? 0 : 2);
});

it("does not encode or upload a map when landmark composition fails", async () => {
	vi.mocked(PlacesRepository.prototype.searchPlacesInArea).mockResolvedValue([
		{
			name: "Shopping",
			category: PlaceCategory.SHOPPING_MALL,
			coordinates: { latitude: input.latitude, longitude: input.longitude },
			notable: true,
		},
	]);
	_rendering.render.mockImplementationOnce(() => {
		throw new Error("private rendering failure");
	});
	const operation = service.startPreparation(input);
	expect(await operation.result).toEqual({ kind: "failed", code: "TRANSFORMATION_UNAVAILABLE", retryable: false });
	await operation.settled;
	expect(repository.encode).not.toHaveBeenCalled();
	expect(repository.upload).not.toHaveBeenCalled();
	expect(_rendering.freeRasterizer).toHaveBeenCalledOnce();
});

it("encodes the provider image unchanged when there are no selected landmarks", async () => {
	const operation = service.startPreparation(input);
	expect(await operation.result).toMatchObject({ kind: "ready" });
	await operation.settled;
	expect(Resvg).not.toHaveBeenCalled();
	expect(repository.encode).toHaveBeenCalledExactlyOnceWith({ bytes: new Uint8Array([1]), width: 960, height: 960 });
});

it("releases both rendering resources when PNG serialization fails", async () => {
	vi.spyOn(landmarks, "getLandmarks").mockResolvedValue([
		{
			label: "Shopping",
			category: PlaceCategory.SHOPPING_MALL,
			x: 240,
			y: 240,
			labelPosition: LandmarkLabelPosition.RIGHT,
		},
	]);
	_rendering.png.mockImplementationOnce(() => {
		throw new Error("private PNG failure");
	});
	const operation = service.startPreparation(input);
	expect(await operation.result).toEqual({ kind: "failed", code: "TRANSFORMATION_UNAVAILABLE", retryable: false });
	await operation.settled;
	expect(_rendering.freeImage).toHaveBeenCalledOnce();
	expect(_rendering.freeRasterizer).toHaveBeenCalledOnce();
	expect(repository.encode).not.toHaveBeenCalled();
	expect(repository.upload).not.toHaveBeenCalled();
});

it("renders selected landmarks onto the base map before encoding and upload", async () => {
	const selected = [
		{
			label: "Shopping",
			category: PlaceCategory.SHOPPING_MALL,
			x: 240,
			y: 240,
			labelPosition: LandmarkLabelPosition.RIGHT,
		},
	];
	vi.spyOn(landmarks, "getLandmarks").mockResolvedValue(selected);
	const operation = service.startPreparation(input);
	expect(await operation.result).toMatchObject({ kind: "ready" });
	await operation.settled;
	expect(Resvg).toHaveBeenCalledOnce();
	const svg = vi.mocked(Resvg).mock.calls[0]![0];
	expect(svg).toContain('width="960" height="960" viewBox="0 0 480 480"');
	expect(svg).toContain("data:image/png;base64,AQ==");
	expect(svg).toContain(">Shopping<");
	expect(_rendering.freeImage).toHaveBeenCalledOnce();
	expect(_rendering.freeRasterizer).toHaveBeenCalledOnce();
	expect(repository.encode).toHaveBeenCalledExactlyOnceWith({ bytes: new Uint8Array([3]), width: 960, height: 960 });
	expect(repository.upload).toHaveBeenCalledOnce();
});

it("embeds large base images as base64 before rendering", async () => {
	const bytes = new Uint8Array(0x8000 * 2 + 3).fill(65);
	vi.mocked(repository.generateImage).mockResolvedValue(bytes);
	vi.spyOn(landmarks, "getLandmarks").mockResolvedValue([
		{
			label: "Shopping",
			category: PlaceCategory.SHOPPING_MALL,
			x: 240,
			y: 240,
			labelPosition: LandmarkLabelPosition.RIGHT,
		},
	]);
	const operation = service.startPreparation(input);
	expect(await operation.result).toMatchObject({ kind: "ready" });
	await operation.settled;
	const svg = vi.mocked(Resvg).mock.calls[0]![0];
	expect(svg).toContain(`base64,${btoa("A".repeat(bytes.length))}"`);
});

it("starts the map download and landmark selection concurrently", async () => {
	const image = Promise.withResolvers<Uint8Array>();
	const selected = Promise.withResolvers<[]>();
	vi.mocked(repository.generateImage).mockReturnValue(image.promise);
	const selection = vi.spyOn(landmarks, "getLandmarks").mockReturnValue(selected.promise);
	const operation = service.startPreparation(input);
	await vi.waitFor(() => {
		expect(repository.generateImage).toHaveBeenCalledOnce();
		expect(selection).toHaveBeenCalledOnce();
	});
	expect(repository.encode).not.toHaveBeenCalled();
	image.resolve(new Uint8Array([1]));
	selected.resolve([]);
	expect(await operation.result).toMatchObject({ kind: "ready" });
	await operation.settled;
});

it("observes the landmark rejection when the concurrent map download throws synchronously", async () => {
	const unhandled = vi.fn();
	process.on("unhandledRejection", unhandled);
	vi.mocked(repository.generateImage).mockImplementation(() => {
		throw new Error("private map failure");
	});
	const selection = vi.spyOn(landmarks, "getLandmarks").mockRejectedValue(new Error("private places failure"));
	try {
		const operation = service.startPreparation(input);
		expect(await operation.result).toEqual({ kind: "failed", code: "INTERNAL_ERROR", retryable: false });
		await operation.settled;
		await vi.advanceTimersByTimeAsync(0);
		expect(selection).toHaveBeenCalledOnce();
		expect(unhandled).not.toHaveBeenCalled();
		expect(repository.encode).not.toHaveBeenCalled();
		expect(repository.upload).not.toHaveBeenCalled();
	} finally {
		process.off("unhandledRejection", unhandled);
	}
});

it("retries landmark provider failures within the existing map preparation budget", async () => {
	vi.mocked(PlacesRepository.prototype.searchPlacesInArea)
		.mockRejectedValueOnce(
			new MapsError({ errorCode: MapsErrorCode.PROVIDER_UNAVAILABLE, retryable: true, retryAfterMs: 1000 }),
		)
		.mockResolvedValue([]);
	const operation = service.startPreparation(input);
	await vi.waitFor(() => expect(PlacesRepository.prototype.searchPlacesInArea).toHaveBeenCalledTimes(6));
	await vi.advanceTimersByTimeAsync(1000);
	expect(await operation.result).toMatchObject({ kind: "ready" });
	await operation.settled;
	expect(PlacesRepository.prototype.searchPlacesInArea).toHaveBeenCalledTimes(12);
	expect(repository.upload).toHaveBeenCalledOnce();
});

async function _overlay(selected: Landmark[]): Promise<string> {
	vi.spyOn(landmarks, "getLandmarks").mockResolvedValue(selected);
	const operation = service.startPreparation(input);
	expect(await operation.result).toMatchObject({ kind: "ready" });
	await operation.settled;
	const svg = vi.mocked(Resvg).mock.calls[0]![0];
	expect(typeof svg).toBe("string");
	if (typeof svg !== "string") throw new Error("Expected SVG markup at the rasterizer boundary.");
	return svg;
}

function _landmark(labelPosition: LandmarkLabelPosition, label = "Shopping Anália Franco"): Landmark {
	return { label: label, category: PlaceCategory.SHOPPING_MALL, x: 200, y: 600, labelPosition: labelPosition };
}

describe("landmark rendering through StaticService", () => {
	it("matches Mateo's fixed label tracking in logical pixels", async () => {
		const svg = await _overlay([_landmark(LandmarkLabelPosition.RIGHT)]);
		expect(svg).toContain('font-size="15"');
		expect(svg).toContain('letter-spacing="-0.2px"');
	});

	it("draws the category badge in the app color with the Mateo icon tinted like the app", async () => {
		const svg = await _overlay([_landmark(LandmarkLabelPosition.RIGHT)]);
		expect(svg).toContain('<circle cx="200" cy="600" r="14" fill="#2B7FFF"');
		expect(svg).toContain('color="#FCFCFC"');
	});

	it.each([
		[LandmarkLabelPosition.RIGHT, 'x="221" y="605.4" text-anchor="start"'],
		[LandmarkLabelPosition.LEFT, 'x="179" y="605.4" text-anchor="end"'],
		[LandmarkLabelPosition.ABOVE, 'x="200" y="573.75" text-anchor="middle"'],
		[LandmarkLabelPosition.BELOW, 'x="200" y="636" text-anchor="middle"'],
	] as const)("places a %s label next to the badge", async (position, expected) => {
		expect(await _overlay([_landmark(position)])).toContain(expected);
	});

	it("escapes names so they cannot break the SVG", async () => {
		expect(await _overlay([_landmark(LandmarkLabelPosition.RIGHT, 'Bar <"A" & B>')])).toContain(
			">Bar &lt;&quot;A&quot; &amp; B&gt;<",
		);
	});

	it("gives repeated icons their own clip path definitions", async () => {
		const svg = await _overlay([
			{ ..._landmark(LandmarkLabelPosition.RIGHT), category: PlaceCategory.RESTAURANT },
			{ ..._landmark(LandmarkLabelPosition.LEFT), category: PlaceCategory.RESTAURANT },
		]);
		expect(new Set(svg.match(/id="[^"]+"/g)).size).toBe(svg.match(/id="[^"]+"/g)?.length);
	});
});

it("reports a transformation failure when landmark rendering receives an unsupported category", async () => {
	vi.spyOn(landmarks, "getLandmarks").mockResolvedValue([
		{ ..._landmark(LandmarkLabelPosition.RIGHT), category: PlaceCategory.OTHER },
	]);
	const operation = service.startPreparation(input);
	expect(await operation.result).toMatchObject({ kind: "failed", code: MapsErrorCode.TRANSFORMATION_UNAVAILABLE });
	await operation.settled;
	expect(Resvg).not.toHaveBeenCalled();
});
