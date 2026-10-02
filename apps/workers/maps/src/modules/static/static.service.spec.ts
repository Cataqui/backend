import { StaticService } from "./static.service";
import { StaticRepository } from "./static.repository";
import { MapsError } from "../../shared/maps.error";
import { MapsErrorCode } from "../../shared/maps-error-code.enum";
import { getStaticGenerationIdentity, getStaticIdentity } from "./static-identity";

const input = { latitude: -23.5, longitude: -46.6 };
const generate = vi.fn();
const getByName = vi.fn().mockReturnValue({ generate: generate });
let repository: StaticRepository;
let service: StaticService;

beforeEach(async () => {
	vi.useFakeTimers();
	vi.spyOn(Math, "random").mockReturnValue(0);
	getByName.mockReturnValue({ generate: generate });
	repository = new StaticRepository({
		bucket: { head: vi.fn(), put: vi.fn(), get: vi.fn() },
		images: { input: vi.fn(), info: vi.fn() },
		generation: { getByName: getByName },
		apiKey: "test",
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
	service = new StaticService({ repository: repository, environment: "development", baseUrl: "https://maps.test" });
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
