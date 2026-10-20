import type { MapshotWorkerEnv } from "../cloudflare.config.ts";
import * as td from "testdouble";
import type { ContainerRenderOutput } from "@cataqui/mapshot-workerhole";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createRenderResult } from "../test/native-render.fixture";
import WorkerEntrypoint from "./worker";
import { MapshotWorkerErrorCode } from "./errors/index";
import { ContainerShutdownFailedError } from "./errors/container-shutdown-failed.error";
import { ContainerRuntimeFailedError } from "./errors/container-runtime-failed.error";
import { ContainerReadinessFailedError } from "./errors/container-readiness-failed.error";
import { RemoteError } from "@cataqui/workerhole";

const _output = createRenderResult();
let _environment: MapshotWorkerEnv;
let _context: ExecutionContext;
let _namespace: DurableObjectNamespace<import("./container").MapshotContainer>;
let _render: ReturnType<DurableObjectNamespace<import("./container").MapshotContainer>["getByName"]>["render"];

afterEach(() => td.reset());
const _input = {
	center: { latitude: -23.55, longitude: -46.63 },
	zoom: 13,
	size: { width: 480, height: 480 },
} as const;

beforeEach(() => {
	_environment = td.object<MapshotWorkerEnv>();
	_namespace = td.object<DurableObjectNamespace<import("./container").MapshotContainer>>();
	_context = Object.assign(td.object<ExecutionContext>(), { exports: { MapshotContainer: _namespace } });
	const container =
		td.object<ReturnType<DurableObjectNamespace<import("./container").MapshotContainer>["getByName"]>>();
	_render = container.render;
	td.when(_render(td.matchers.anything())).thenResolve(_output);
	td.when(_namespace.getByName(td.matchers.anything())).thenReturn(container);
});

it("returns only image delivery fields without Mapshot source or renderer internals", async () => {
	const entry = new WorkerEntrypoint(_context, _environment);
	const result = await entry.render({
		center: { latitude: -23.55, longitude: -46.63 },
		zoom: 13,
		size: { width: 480, height: 480 },
	});
	expect(result).toEqual({
		bytes: _output.bytes,
		contentType: "image/webp",
		width: 960,
		height: 960,
		digest: _output.metadata.digest,
	});
});

it("exposes rendering to its private RPC consumers", () => {
	expect(Object.getOwnPropertyNames(WorkerEntrypoint.prototype).sort()).toEqual(["constructor", "render"]);
});

it("validates the default worker render RPC before delegating", async () => {
	const entry = new WorkerEntrypoint(_context, _environment);
	const input = {
		center: { latitude: -23.55, longitude: -46.63 },
		zoom: 13 as const,
		size: { width: 480 as const, height: 480 as const },
	};
	await expect(entry.render(input)).resolves.toEqual({
		bytes: _output.bytes,
		contentType: "image/webp",
		width: 960,
		height: 960,
		digest: _output.metadata.digest,
	});
	expect(td.explain(_render).calls.map((call) => call.args)).toEqual([
		[{ center: input.center, zoom: input.zoom, size: input.size }],
	]);
	await expect(Reflect.apply(entry.render, entry, [{ ...input, zoom: Number.NaN }])).rejects.toThrow("violations");
	expect(td.explain(_render).callCount).toBe(1);
});

it("returns VALIDATION_ERROR for invalid caller input without exposing submitted keys or values", async () => {
	const entry = new WorkerEntrypoint(_context, _environment);
	const result = await Reflect.apply(entry.render, entry, [
		{
			center: { latitude: 90, longitude: 200 },
			zoom: Number.NaN,
			size: { width: 0, height: 1 },
			"private-submitted-key": "private-submitted-value",
		},
	]).catch((error: unknown) => error);

	expect(result).toMatchObject({ name: "RenderValidationError", errorCode: "VALIDATION_ERROR" });
	if (!(result instanceof Error)) throw new Error("Expected owned validation failure");
	const parsed = JSON.parse(result.message);
	expect(parsed.violations).toEqual(
		expect.arrayContaining([
			{ path: ["center", "latitude"], message: expect.any(String) },
			{ path: ["center", "longitude"], message: expect.any(String) },
			{ path: ["zoom"], message: expect.any(String) },
			{ path: ["size", "width"], message: expect.any(String) },
			{ path: [], message: "Only documented fields are supported." },
		]),
	);
	expect(result.message).not.toContain("private-submitted");
});

it("identifies the invalid dimension without rejecting valid custom sizes", async () => {
	const entry = new WorkerEntrypoint(_context, _environment);
	const error = await Reflect.apply(entry.render, entry, [
		{ center: { latitude: -23.55, longitude: -46.63 }, zoom: 13, size: { width: 0, height: 1 } },
	]).catch((failure: unknown) => failure);
	if (!(error instanceof Error)) throw new Error("Expected owned validation failure");
	expect(JSON.parse(error.message).violations).toEqual([{ path: ["size", "width"], message: expect.any(String) }]);
});

it("forwards caller-selected dimensions outside Maps presets unchanged", async () => {
	const entry = new WorkerEntrypoint(_context, _environment);
	const input = { ..._input, size: { width: 481, height: 600 } };
	await entry.render(input);
	expect(td.explain(_render).calls.map((call) => call.args)).toEqual([[input]]);
});

it.each([-1.5, 0, 12.75, 27.5])("forwards a caller-selected finite zoom of %s", async (zoom) => {
	const entry = new WorkerEntrypoint(_context, _environment);
	const input = { ..._input, zoom: zoom };
	await entry.render(input);
	expect(td.explain(_render).calls.map((call) => call.args)).toEqual([[input]]);
});

it("passes through image stream ownership without consuming its body", async () => {
	const output = createRenderResult();
	td.when(_render(td.matchers.anything())).thenResolve(output);
	const entry = new WorkerEntrypoint(_context, _environment);
	const result = await entry.render(_input);
	expect(result.bytes).toBe(output.bytes);
	expect(result.bytes.locked).toBe(false);
	expect(new Uint8Array(await new Response(result.bytes).arrayBuffer())).toEqual(Uint8Array.of(1));
});

it("routes each camera and image size directly to the single named renderer", async () => {
	const entry = new WorkerEntrypoint(_context, _environment);
	await entry.render(_input);
	await entry.render(_input);
	await entry.render({ ..._input, size: { width: 480, height: 1280 } });
	await entry.render({ ..._input, center: { latitude: 35.68, longitude: 139.76 } });
	expect(td.explain(_namespace.getByName).calls.map((call) => call.args)).toEqual([
		["renderer-0"],
		["renderer-0"],
		["renderer-0"],
		["renderer-0"],
	]);
	expect(td.explain(_render).calls.map((call) => call.args)).toEqual([
		[_input],
		[_input],
		[{ ..._input, size: { width: 480, height: 1280 } }],
		[{ ..._input, center: { latitude: 35.68, longitude: 139.76 } }],
	]);
});

it.each([
	{ latitude: -23.55, longitude: -46.63 },
	{ latitude: 35.68, longitude: 139.76 },
	{ latitude: 0, longitude: -179.99 },
	{ latitude: 60.17, longitude: 24.94 },
])("preserves worldwide camera coordinates ($latitude, $longitude)", async (center) => {
	const entry = new WorkerEntrypoint(_context, _environment);
	await entry.render({ ..._input, center: center });
	expect(td.explain(_render).calls[0]!.args[0].center).toEqual(center);
});

it("sanitizes private container render failures", async () => {
	td.when(_render(td.matchers.anything())).thenReject(new Error("private address"));
	const entry = new WorkerEntrypoint(_context, _environment);
	await expect(entry.render(_input)).rejects.toMatchObject({
		errorCode: MapshotWorkerErrorCode.RENDERING_UNAVAILABLE,
		message: "",
	});
});

it("sanitizes container binding lookup failures", async () => {
	td.when(_namespace.getByName(td.matchers.anything())).thenDo((): never => {
		throw new Error("private binding");
	});
	const entry = new WorkerEntrypoint(_context, _environment);
	await expect(entry.render(_input)).rejects.toMatchObject({
		errorCode: MapshotWorkerErrorCode.RENDERING_UNAVAILABLE,
		message: "",
	});
	expect(td.explain(_render).callCount).toBe(0);
});

it("uses the container's validated image result without requiring or revalidating renderer provenance", async () => {
	const output = {
		bytes: _output.bytes,
		metadata: {
			contentType: _output.metadata.contentType,
			digest: _output.metadata.digest,
			pixelWidth: _output.metadata.pixelWidth,
			pixelHeight: _output.metadata.pixelHeight,
			futureField: true,
		},
	} satisfies ContainerRenderOutput & { metadata: { futureField: boolean } };
	td.when(_render(td.matchers.anything())).thenResolve(output);
	const entry = new WorkerEntrypoint(_context, _environment);
	await expect(entry.render(_input)).resolves.toEqual({
		bytes: _output.bytes,
		contentType: _output.metadata.contentType,
		width: _output.metadata.pixelWidth,
		height: _output.metadata.pixelHeight,
		digest: _output.metadata.digest,
	});
});

it.each([
	new ContainerShutdownFailedError(),
	new ContainerRuntimeFailedError(),
	new ContainerReadinessFailedError({ message: "Native Container not ready" }),
	new RemoteError({
		name: "RenderingClosedError",
		message: "Rendering has closed.",
		errorCode: "CLOSED",
	}),
])("translates internal $name failures only at the render boundary", async (failure) => {
	td.when(_render(td.matchers.anything())).thenReject(failure);
	const entry = new WorkerEntrypoint(_context, _environment);
	await expect(entry.render(_input)).rejects.toMatchObject({
		name: "RenderingUnavailableError",
		errorCode: MapshotWorkerErrorCode.RENDERING_UNAVAILABLE,
		message: "",
	});
});
