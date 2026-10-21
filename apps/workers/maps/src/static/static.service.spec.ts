import * as td from "testdouble";
import { MapsErrorCode } from "../errors/maps-error-code.enum";
import { TransformationUnavailableError } from "./errors/transformation-unavailable.error";
import { LocationReferenceService } from "./location-reference.service";
import { StaticRepository, type GenerateStaticImageOutput } from "./static.repository";
import { StaticService } from "./static.service";

const _reference = "signed-location";
const _center = { latitude: -23.5505, longitude: -46.6333 };
const _image = {
	bytes: new Uint8Array([1, 2, 3]),
	contentType: "image/webp",
	digest: "a".repeat(64),
} satisfies GenerateStaticImageOutput;
let _repository: StaticRepository;
let _locationReferenceService: LocationReferenceService;
let _service: StaticService;

afterEach(() => td.reset());
beforeEach(() => {
	_repository = td.object<StaticRepository>();
	_locationReferenceService = td.object<LocationReferenceService>();
	_service = new StaticService(_repository, _locationReferenceService);
	td.when(_locationReferenceService.read(_reference)).thenResolve(_center);
	td.when(_repository.generateImage(td.matchers.anything())).thenResolve(_image);
});

it("returns no image for an invalid reference before rendering", async () => {
	td.when(_locationReferenceService.read(_reference)).thenResolve(null);
	expect(await _service.generateImage({ reference: _reference, size: "480x480" })).toBeNull();
	expect(td.explain(_repository.generateImage).callCount).toBe(0);
});

it.each([480, 1280] as const)("renders the signed location at the supported height %s", async (height) => {
	const signal = new AbortController().signal;
	const image = await _service.generateImage({ reference: _reference, size: `480x${height}`, signal: signal });
	expect(image).toBe(_image);
	expect(td.explain(_repository.generateImage).calls.map((call) => call.args)).toEqual([
		[{ center: _center, zoom: 13, size: { width: 480, height: height }, signal: signal }],
	]);
});

it("renders each invocation without retaining an application cache", async () => {
	await _service.generateImage({ reference: _reference, size: "480x480" });
	await _service.generateImage({ reference: _reference, size: "480x480" });
	expect(td.explain(_repository.generateImage).callCount).toBe(2);
});

it("preserves a known rendering failure", async () => {
	const failure = new TransformationUnavailableError();
	td.when(_repository.generateImage(td.matchers.anything())).thenReject(failure);
	await expect(_service.generateImage({ reference: _reference, size: "480x480" })).rejects.toBe(failure);
});

it("translates an unknown rendering failure for the public error boundary", async () => {
	td.when(_repository.generateImage(td.matchers.anything())).thenReject(new Error("private renderer failure"));
	await expect(_service.generateImage({ reference: _reference, size: "480x480" })).rejects.toMatchObject({
		errorCode: MapsErrorCode.TRANSFORMATION_UNAVAILABLE,
		message: "The static map could not be prepared.",
	});
});

it("stops an already aborted request before rendering", async () => {
	const signal = AbortSignal.abort();
	await expect(_service.generateImage({ reference: _reference, size: "480x480", signal: signal })).rejects.toBe(
		signal.reason,
	);
	expect(td.explain(_repository.generateImage).callCount).toBe(0);
});

it.each([false, true])("preserves cancellation during rendering, failed %s", async (failed) => {
	const controller = new AbortController();
	const reason = new DOMException("Cancelled while rendering", "AbortError");
	td.when(_repository.generateImage(td.matchers.anything())).thenDo(async (): Promise<GenerateStaticImageOutput> => {
		controller.abort(reason);
		if (failed) throw new Error("provider failed after cancellation");
		return _image;
	});
	await expect(
		_service.generateImage({ reference: _reference, size: "480x480", signal: controller.signal }),
	).rejects.toBe(reason);
});
