import { StaticGenerationDurableObject } from "./static-generation.durable-object";
import { StaticRepository } from "./static.repository";
import { MapsError } from "../../shared/maps.error";
import { MapsErrorCode } from "../../shared/maps-error-code.enum";
import { getStaticGenerationIdentity, getStaticIdentity } from "./static-identity";

vi.mock("./static.repository");
const input = { latitude: -23.5, longitude: -46.6 };

function _coordinator() {
	const equals = vi.fn<(other: DurableObjectId) => boolean>().mockReturnValue(true);
	const context: Pick<DurableObjectState, "id" | "waitUntil"> = {
		id: { equals: equals, toString: () => "test" },
		waitUntil: vi.fn(),
	};
	const idFromName = vi.fn();
	const coordinator = new StaticGenerationDurableObject(
		context as DurableObjectState,
		{
			ENVIRONMENT: "development",
			GEOAPIFY_API_KEY: "test",
			GOOGLE_PLACES_API_KEY: "test",
			MICROSERVICES_AUTH_JWKS_URL: "http://localhost:3000/v1/auth/microservices/jwks",
			STATIC_IMAGES: {} as R2Bucket,
			PLACE_SEARCH_RATE_LIMITER: { limit: vi.fn() },
			PLACE_DETAILS_RATE_LIMITER: { limit: vi.fn() },
			STATIC_BASE_URL: "http://localhost:8787",
			GENERATION: {
				idFromName: idFromName,
				get: vi.fn(),
				getByName: vi.fn(),
				idFromString: vi.fn(),
				newUniqueId: vi.fn(),
				jurisdiction: vi.fn(),
			},
			IMAGES: {} as ImagesBinding,
		} as MapsWorkerEnv,
	);
	return { coordinator: coordinator, equals: equals, idFromName: idFromName };
}

beforeEach(() => {
	vi.resetAllMocks();
	vi.mocked(StaticRepository.prototype.findImage).mockResolvedValue(false);
	vi.mocked(StaticRepository.prototype.upload).mockResolvedValue(undefined);
	vi.mocked(StaticRepository.prototype.encode).mockResolvedValue(new Uint8Array([2]));
	vi.mocked(StaticRepository.prototype.generateImage).mockResolvedValue(new Uint8Array([1]));
});

describe("coordinate-only map preparation", () => {
	it("generates both 2x maps from one coordinate request", async () => {
		const result = await _coordinator().coordinator.generate(input);
		expect(result).toMatchObject({
			kind: "ready",
			asset: { id: expect.stringMatching(/^[a-f0-9]{64}$/), url: expect.stringMatching(/\/static\/[a-f0-9]{64}$/) },
		});
	});
	it("owns logical dimensions without caller density", async () => {
		await _coordinator().coordinator.generate(input);
		expect(StaticRepository.prototype.generateImage).toHaveBeenCalledTimes(2);
		expect(vi.mocked(StaticRepository.prototype.generateImage).mock.calls).toEqual(
			expect.arrayContaining([
				[{ center: input, size: { width: 480, height: 480 }, signal: expect.any(AbortSignal) }],
				[{ center: input, size: { width: 480, height: 1280 }, signal: expect.any(AbortSignal) }],
			]),
		);
	});
	it("deduplicates concurrent requests for the same map set", async () => {
		const { coordinator } = _coordinator();
		await Promise.all([coordinator.generate(input), coordinator.generate(input)]);
		expect(StaticRepository.prototype.upload).toHaveBeenCalledTimes(2);
	});
	it("routes the complete output set to its own coordinator", async () => {
		const { coordinator, idFromName } = _coordinator();
		await coordinator.generate(input);
		expect(idFromName).toHaveBeenCalledWith(
			await getStaticGenerationIdentity({ input: input, environment: "development" }),
		);
	});
	it("waits until both variants are uploaded", async () => {
		const gate = Promise.withResolvers<void>();
		vi.mocked(StaticRepository.prototype.upload).mockImplementation(async (image) => {
			if (image.height === 2560) await gate.promise;
		});
		let finished = false;
		const pending = _coordinator()
			.coordinator.generate(input)
			.then((result) => {
				finished = true;
				return result;
			});
		await vi.waitFor(() => expect(StaticRepository.prototype.upload).toHaveBeenCalledTimes(2));
		const finishedBeforeBothWereReady = finished;
		gate.resolve();
		await pending;
		expect(finishedBeforeBothWereReady).toBe(false);
	});
	it("returns failure when one required upload fails", async () => {
		vi.mocked(StaticRepository.prototype.upload).mockImplementation(async (image) => {
			if (image.height === 2560) throw new MapsError({ errorCode: MapsErrorCode.STORAGE_UNAVAILABLE, retryable: true });
		});
		expect(await _coordinator().coordinator.generate(input)).toEqual({
			kind: "failed",
			code: "STORAGE_UNAVAILABLE",
			retryable: true,
		});
	});
	it("reuses a previously uploaded output while generating its missing companion", async () => {
		const readyId = await getStaticIdentity({
			assetId: await getStaticGenerationIdentity({ input: input, environment: "development" }),
			size: { width: 480, height: 480 },
			scale: 2,
			zoom: 13,
		});
		vi.mocked(StaticRepository.prototype.findImage).mockImplementation(async ({ key }) =>
			key.endsWith(`/${readyId}.webp`),
		);
		await _coordinator().coordinator.generate(input);
		expect(StaticRepository.prototype.generateImage).toHaveBeenCalledExactlyOnceWith({
			center: input,
			size: { width: 480, height: 1280 },
			signal: expect.any(AbortSignal),
		});
	});
	it("releases a failed batch so a retry can complete", async () => {
		const { coordinator } = _coordinator();
		vi.mocked(StaticRepository.prototype.upload).mockRejectedValueOnce(
			new MapsError({ errorCode: MapsErrorCode.STORAGE_UNAVAILABLE, retryable: false }),
		);
		expect(await coordinator.generate(input)).toMatchObject({ kind: "failed" });
		expect(await coordinator.generate(input)).toMatchObject({ kind: "ready" });
	});
	it("rejects out-of-range coordinates", async () => {
		expect(await _coordinator().coordinator.generate({ latitude: 91, longitude: 0 })).toMatchObject({
			kind: "failed",
			code: "INVALID_INPUT",
			retryable: false,
		});
	});
	it("rejects a request delivered to the wrong coordinator", async () => {
		const { coordinator, equals } = _coordinator();
		equals.mockReturnValue(false);
		expect(await coordinator.generate(input)).toEqual({ kind: "failed", code: "INVALID_INPUT", retryable: false });
	});
	it("sanitizes unexpected failures", async () => {
		vi.mocked(StaticRepository.prototype.generateImage).mockRejectedValue(new Error("private provider details"));
		expect(await _coordinator().coordinator.generate(input)).toEqual({
			kind: "failed",
			code: "INTERNAL_ERROR",
			retryable: false,
		});
	});
	it("keeps unrelated Maps error codes out of the static generation RPC contract", async () => {
		vi.mocked(StaticRepository.prototype.generateImage).mockRejectedValue(
			new MapsError({ errorCode: MapsErrorCode.PLACE_NOT_FOUND }),
		);
		expect(await _coordinator().coordinator.generate(input)).toEqual({
			kind: "failed",
			code: "INTERNAL_ERROR",
			retryable: false,
		});
	});
});

describe("stage retries and late binding completion", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.spyOn(Math, "random").mockReturnValue(0);
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});
	it("retries encoding with the original PNG without downloading it again", async () => {
		vi.mocked(StaticRepository.prototype.encode).mockRejectedValueOnce(
			new MapsError({ errorCode: MapsErrorCode.TRANSFORMATION_UNAVAILABLE, retryable: true }),
		);
		const pending = _coordinator().coordinator.generate(input);
		await vi.waitFor(() => expect(StaticRepository.prototype.encode).toHaveBeenCalledTimes(2));
		await vi.advanceTimersByTimeAsync(1000);
		expect(await pending).toMatchObject({ kind: "ready" });
		const calls = vi.mocked(StaticRepository.prototype.encode).mock.calls;
		expect(calls).toHaveLength(3);
		expect(calls[2]?.[0].bytes).toBe(calls[0]?.[0].bytes);
		expect(StaticRepository.prototype.generateImage).toHaveBeenCalledTimes(2);
		expect(StaticRepository.prototype.upload).toHaveBeenCalledTimes(2);
	});

	it("retries upload with the same bytes without regenerating successful maps", async () => {
		vi.mocked(StaticRepository.prototype.upload).mockRejectedValueOnce(
			new MapsError({ errorCode: MapsErrorCode.STORAGE_UNAVAILABLE, retryable: true }),
		);
		const pending = _coordinator().coordinator.generate(input);
		await vi.waitFor(() => expect(StaticRepository.prototype.upload).toHaveBeenCalledTimes(2));
		await vi.advanceTimersByTimeAsync(1000);
		expect(await pending).toMatchObject({ kind: "ready" });
		const uploads = vi.mocked(StaticRepository.prototype.upload).mock.calls;
		expect(uploads).toHaveLength(3);
		expect(uploads[2]?.[0].bytes).toBe(uploads[0]?.[0].bytes);
		expect(StaticRepository.prototype.generateImage).toHaveBeenCalledTimes(2);
	});
	it("retries a temporary lookup failure before generating only the missing output", async () => {
		vi.mocked(StaticRepository.prototype.findImage).mockRejectedValueOnce(
			new MapsError({ errorCode: MapsErrorCode.STORAGE_UNAVAILABLE, retryable: true }),
		);
		const pending = _coordinator().coordinator.generate(input);
		await vi.waitFor(() => expect(StaticRepository.prototype.findImage).toHaveBeenCalledTimes(2));
		await vi.advanceTimersByTimeAsync(1000);
		expect(await pending).toMatchObject({ kind: "ready" });
		expect(StaticRepository.prototype.findImage).toHaveBeenCalledTimes(3);
		expect(StaticRepository.prototype.generateImage).toHaveBeenCalledTimes(2);
	});
	it("returns by the deadline and prevents overlapping uploads until late settlement", async () => {
		const upload = Promise.withResolvers<void>();
		vi.mocked(StaticRepository.prototype.upload).mockReturnValue(upload.promise);
		const { coordinator } = _coordinator();
		const first = coordinator.generate(input);
		await vi.waitFor(() => expect(StaticRepository.prototype.upload).toHaveBeenCalledTimes(2));
		await vi.advanceTimersByTimeAsync(40_000);
		expect(await first).toMatchObject({ kind: "failed", code: "PROVIDER_TIMEOUT", retryable: true });
		expect(await coordinator.generate(input)).toMatchObject({ kind: "failed" });
		expect(StaticRepository.prototype.upload).toHaveBeenCalledTimes(2);
		upload.resolve();
		await vi.advanceTimersByTimeAsync(0);
		vi.mocked(StaticRepository.prototype.findImage).mockResolvedValue(true);
		expect(await coordinator.generate(input)).toMatchObject({ kind: "ready" });
		expect(StaticRepository.prototype.upload).toHaveBeenCalledTimes(2);
	});
});
