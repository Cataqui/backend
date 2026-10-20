import type { MapsWorkerEnv } from "../../cloudflare.config.ts";
import * as td from "testdouble";
import { raceWithSignal } from "@cataqui/async";

import type { GenerateStaticImageOutput } from "./static.repository";
import { StaticRepository } from "./static.repository";

vi.mock("@cataqui/async", async () => {
	const td = await import("testdouble");
	return { raceWithSignal: td.func<typeof raceWithSignal>() };
});
afterEach(() => td.reset());
afterEach(() => vi.restoreAllMocks());
beforeEach(() => {
	td.when(raceWithSignal(td.matchers.isA(Function), td.matchers.anything())).thenDo(
		(operation: () => Promise<unknown>): Promise<unknown> => operation(),
	);
});
const _input = {
	center: { latitude: -23.5505, longitude: -46.6333 },
	zoom: 13,
	size: { width: 480, height: 480 },
} satisfies Parameters<StaticRepository["generateImage"]>[0];
const _bytes = new Uint8Array([1, 2, 3]);
const _output = {
	bytes: _bytes,
	contentType: "image/webp",
	digest: "a".repeat(64),
} satisfies GenerateStaticImageOutput;
let _rpcOutput: Awaited<ReturnType<MapsWorkerEnv["MAPSHOT"]["render"]>>;
let _dispose: () => void;
beforeEach(() => {
	_dispose = td.func<() => void>();
	_rpcOutput = { ..._output, width: 960, height: 960, bytes: new Blob([_bytes]).stream(), [Symbol.dispose]: _dispose };
});
function _setup(): { repository: StaticRepository; render: MapsWorkerEnv["MAPSHOT"]["render"] } {
	const mapshot = td.object<MapsWorkerEnv["MAPSHOT"]>();
	td.when(mapshot.render(td.matchers.anything())).thenResolve(_rpcOutput);
	return { repository: new StaticRepository(mapshot), render: mapshot.render };
}
it("collects image bytes, maps the viewport, and releases the RPC result", async () => {
	const setup = _setup();
	const producerOutput = { ..._rpcOutput, renderer: { revision: "private" } };
	td.when(setup.render(td.matchers.anything())).thenResolve(producerOutput);
	expect(await setup.repository.generateImage(_input)).toEqual(_output);
	expect(td.explain(setup.render).calls.map((call) => call.args)).toEqual([
		[{ center: _input.center, zoom: _input.zoom, size: _input.size }],
	]);
	expect(td.explain(_dispose).callCount).toBe(1);
});
it("cancels and releases a stream returned after caller cancellation", async () => {
	const setup = _setup();
	const cancel = td.func<(reason: unknown) => void>();
	const controller = new AbortController();
	const entered = Promise.withResolvers<void>();
	const pending = Promise.withResolvers<typeof _rpcOutput>();
	td.when(setup.render(td.matchers.anything())).thenDo((): Promise<typeof _rpcOutput> => {
		entered.resolve();
		return pending.promise;
	});
	const operation = setup.repository.generateImage({
		center: _input.center,
		zoom: _input.zoom,
		size: _input.size,
		signal: controller.signal,
	});
	await entered.promise;
	controller.abort();
	pending.resolve({ ..._rpcOutput, bytes: new ReadableStream({ cancel: cancel }) });
	await expect(operation).rejects.toBe(controller.signal.reason);
	td.verify(cancel(controller.signal.reason));
	expect(td.explain(_dispose).callCount).toBe(1);
});
it("cancels consumption and releases the RPC result when the caller aborts", async () => {
	const setup = _setup();
	const controller = new AbortController();
	const entered = Promise.withResolvers<void>();
	const cancel = td.func<(reason: unknown) => void>();
	const bytes = new ReadableStream<Uint8Array>(
		{
			pull(): void {
				entered.resolve();
			},
			cancel: cancel,
		},
		{ highWaterMark: 0 },
	);
	td.when(setup.render(td.matchers.anything())).thenResolve({ ..._rpcOutput, bytes: bytes });
	const operation = setup.repository.generateImage({
		center: _input.center,
		zoom: _input.zoom,
		size: _input.size,
		signal: controller.signal,
	});
	await entered.promise;
	controller.abort();
	await expect(operation).rejects.toBe(controller.signal.reason);
	td.verify(cancel(controller.signal.reason));
	expect(td.explain(_dispose).callCount).toBe(1);
});
it("propagates stream failures and releases the RPC result", async () => {
	const setup = _setup();
	const failure = new Error("private image stream failure");
	const bytes = new ReadableStream<Uint8Array>({
		start(controller): void {
			controller.error(failure);
		},
	});
	td.when(setup.render(td.matchers.anything())).thenResolve({ ..._rpcOutput, bytes: bytes });
	await expect(setup.repository.generateImage(_input)).rejects.toBe(failure);
	expect(td.explain(_dispose).callCount).toBe(1);
});
it("uses the producer's digest without hashing bytes again", async () => {
	const setup = _setup();
	const hash = vi.spyOn(crypto.subtle, "digest");
	expect(await setup.repository.generateImage(_input)).toMatchObject({ digest: _output.digest });
	expect(hash).not.toHaveBeenCalled();
});
it("propagates provider failures without choosing an application error", async () => {
	const setup = _setup();
	const failure = new Error("private renderer diagnostic");
	td.when(setup.render(td.matchers.anything())).thenReject(failure);
	await expect(setup.repository.generateImage(_input)).rejects.toBe(failure);
	expect(td.explain(_dispose).callCount).toBe(0);
});
it("stops already cancelled work through the cancellation utility", async () => {
	const setup = _setup();
	const signal = AbortSignal.abort();
	td.when(raceWithSignal(td.matchers.anything(), { signal: signal })).thenReject(signal.reason);
	await expect(
		setup.repository.generateImage({ center: _input.center, zoom: _input.zoom, size: _input.size, signal: signal }),
	).rejects.toBe(signal.reason);
	expect(td.explain(setup.render).callCount).toBe(0);
});
it("forwards the caller's signal to the cancellation utility", async () => {
	const setup = _setup();
	const signal = new AbortController().signal;
	await setup.repository.generateImage({ center: _input.center, zoom: _input.zoom, size: _input.size, signal: signal });
	expect(td.explain(raceWithSignal).calls.map((call) => call.args)).toEqual([
		[expect.any(Function), { signal: signal }],
	]);
});
it("honors cancellation immediately after the operation settles", async () => {
	const setup = _setup();
	const controller = new AbortController();
	td.when(raceWithSignal(td.matchers.anything(), td.matchers.anything())).thenDo(
		async (operation: () => Promise<unknown>): Promise<unknown> => {
			const output = await operation();
			controller.abort();
			return output;
		},
	);
	await expect(
		setup.repository.generateImage({
			center: _input.center,
			zoom: _input.zoom,
			size: _input.size,
			signal: controller.signal,
		}),
	).rejects.toMatchObject({
		name: "AbortError",
	});
});
