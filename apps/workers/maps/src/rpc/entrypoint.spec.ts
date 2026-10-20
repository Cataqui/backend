import type { MapsWorkerEnv } from "../../cloudflare.config.ts";
import { container } from "tsyringe";
import * as td from "testdouble";
import { LocationReferenceService } from "../static/location-reference.service";
import { WorkerEntrypoint } from "./entrypoint";
import { StaticMapUrlGenerationFailedError } from "./errors/static-map-url-generation-failed.error";

let service: LocationReferenceService;
afterEach(() => {
	td.reset();
	container.clearInstances();
});
beforeEach(() => {
	service = td.object<LocationReferenceService>();
	container.registerInstance(LocationReferenceService, service);
});

it("delegates only validated coordinates and returns the signed map reference", async () => {
	const environment = td.object<MapsWorkerEnv>();
	const entrypoint = new WorkerEntrypoint(td.object<ExecutionContext>(), environment);
	const output: Awaited<ReturnType<LocationReferenceService["createUrl"]>> = {
		url: "https://maps.cataqui.com/static/v1/reference",
	};
	td.when(service.createUrl(td.matchers.anything())).thenResolve(output);
	const result = await entrypoint.getStaticMapLocationUrl({ latitude: -23.6, longitude: -46.7 });
	expect(result).toBe(output);
	expect(td.explain(service.createUrl).calls.map((call) => call.args)).toEqual([
		[{ latitude: -23.6, longitude: -46.7 }],
	]);
});
it("returns the signed URL without scheduling background work", async () => {
	const context = td.object<ExecutionContext>();
	const entrypoint = new WorkerEntrypoint(context, td.object<MapsWorkerEnv>());
	td.when(service.createUrl(td.matchers.anything())).thenResolve({
		url: "https://maps.cataqui.com/static/v1/reference.webp",
	});
	await entrypoint.getStaticMapLocationUrl({ latitude: 0, longitude: 0 });
	expect(td.explain(context.waitUntil).callCount).toBe(0);
});

it("preserves an owned service error", async () => {
	const entrypoint = new WorkerEntrypoint(td.object<ExecutionContext>(), td.object<MapsWorkerEnv>());
	const failure = new StaticMapUrlGenerationFailedError();
	td.when(service.createUrl(td.matchers.anything())).thenReject(failure);
	await expect(entrypoint.getStaticMapLocationUrl({ latitude: 0, longitude: 0 })).rejects.toBe(failure);
});
it("sanitizes internal signing failures before propagating them", async () => {
	const entrypoint = new WorkerEntrypoint(td.object<ExecutionContext>(), td.object<MapsWorkerEnv>());
	td.when(service.createUrl(td.matchers.anything())).thenReject(new Error("private signing details"));
	await expect(entrypoint.getStaticMapLocationUrl({ latitude: 0, longitude: 0 })).rejects.toMatchObject({
		name: "StaticMapUrlGenerationFailedError",
		errorCode: "INTERNAL_ERROR",
		message: "Static map URL generation failed.",
		status: 500,
	});
});
it.each([
	{ latitude: 85.051129, longitude: 0 },
	{ latitude: -85.051129, longitude: 0 },
	{ latitude: 0, longitude: 181 },
	{ latitude: 0, longitude: -181 },
	{ latitude: Infinity, longitude: 0 },
	{ latitude: 0, longitude: NaN },
])("rejects invalid coordinates before constructing the service %j", async (input) => {
	const entrypoint = new WorkerEntrypoint(td.object<ExecutionContext>(), td.object<MapsWorkerEnv>());
	await expect(entrypoint.getStaticMapLocationUrl(input)).rejects.toBeInstanceOf(TypeError);
	expect(td.explain(service.createUrl).callCount).toBe(0);
});
it("reports every invalid coordinate field without returning submitted values", async () => {
	const entrypoint = new WorkerEntrypoint(td.object<ExecutionContext>(), td.object<MapsWorkerEnv>());
	const pending = entrypoint.getStaticMapLocationUrl({ latitude: 91, longitude: 181 });
	await expect(pending).rejects.toThrow(/latitude: .*; longitude: /);
	await expect(pending).rejects.not.toThrow(/91|181/);
});
it("rejects rendering options before constructing the signing service", async () => {
	const entrypoint = new WorkerEntrypoint(td.object<ExecutionContext>(), td.object<MapsWorkerEnv>());
	// @ts-expect-error Signing accepts coordinates without caller-selected rendering options.
	const pending = entrypoint.getStaticMapLocationUrl({ latitude: 0, longitude: 0, zoom: 12 });
	await expect(pending).rejects.toThrow(/input:/);
	expect(td.explain(service.createUrl).callCount).toBe(0);
});
it("exposes no legacy generation method on the private capability", () => {
	expect(Object.hasOwn(WorkerEntrypoint.prototype, "generateStaticMaps")).toBe(false);
});

it("returns local development map URLs through the private signing contract", async () => {
	const environment = td.object<MapsWorkerEnv>();
	environment.STATIC_BASE_URL = "http://localhost:8787";
	const output = { url: `${environment.STATIC_BASE_URL}/static/v1/reference.webp` };
	td.when(service.createUrl(td.matchers.anything())).thenResolve(output);
	const entrypoint = new WorkerEntrypoint(td.object<ExecutionContext>(), environment);
	expect(await entrypoint.getStaticMapLocationUrl({ latitude: 0, longitude: 0 })).toEqual(output);
});
