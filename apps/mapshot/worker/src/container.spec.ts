import type { MapshotWorkerEnv } from "../cloudflare.config.ts";
import * as td from "testdouble";
import { MapshotContainer } from "./container";
import { MapshotWorkerPortal } from "./worker-portal";
import { RemoteError, type ConnectToContainerOptions } from "@cataqui/workerhole";
import { ContainerConfig, type ContainerRenderOutput, MapshotWorkerContainerPortal } from "@cataqui/mapshot-workerhole";
import type { MapshotRenderInput } from "@cataqui/mapshot-workerhole";

const _events = vi.hoisted(() => [] as string[]);

const _workerhole = await vi.hoisted(async () => {
	const td = await import("testdouble");
	return { create: td.func<typeof import("@cataqui/workerhole").connectWorkerToContainer>() };
});
const _channels = vi.hoisted(() => new WeakMap<object, MapshotWorkerContainerPortal>());
vi.mock("@cataqui/workerhole", async (importOriginal) => ({
	...(await importOriginal<typeof import("@cataqui/workerhole")>()),
	connectWorkerToContainer: _workerhole.create,
}));
vi.mock("@cloudflare/containers", async () => {
	const { DurableObject } = await import("cloudflare:workers");
	return {
		Container: class<Environment> extends DurableObject<Environment> {
			defaultPort: number | undefined;
			enableInternet = true;
			sleepAfter: string | number = "10m";
			async start(): Promise<void> {
				if (this.ctx.container === undefined) throw new TypeError("Container unavailable");
				if (!this.ctx.container.running) this.ctx.container.start({ enableInternet: this.enableInternet });
			}
			async stop(): Promise<void> {
				this.ctx.container?.signal(15);
			}
			renewActivityTimeout(): void {}
		},
	};
});
const _input: MapshotRenderInput = {
	center: { latitude: -23.55, longitude: -46.63 },
	zoom: 13,
	size: { width: 480, height: 480 },
};
const _result = {
	bytes: Uint8Array.of(1, 2, 3),
	metadata: { contentType: "image/webp" as const, digest: "a".repeat(64), pixelWidth: 960, pixelHeight: 960 },
} satisfies { bytes: Uint8Array<ArrayBuffer>; metadata: ContainerRenderOutput["metadata"] };
function _output(): ContainerRenderOutput {
	return { bytes: new Blob([_result.bytes]).stream(), metadata: _result.metadata };
}
async function _render(coordinator: MapshotContainer): Promise<typeof _result> {
	const output = await coordinator.render(_input);
	return { bytes: new Uint8Array(await new Response(output.bytes).arrayBuffer()), metadata: output.metadata };
}
function _health(): Response {
	return Response.json({ ready: true });
}
function _coordinator(params: { running?: boolean; missing?: boolean; production?: boolean } = {}): {
	coordinator: MapshotContainer;
	container: { -readonly [Key in keyof Container]: Container[Key] };
	start: Container["start"];
	signal: Container["signal"];
	lifecycle: { stopOnSignal: boolean };
	destroy: Container["destroy"];
	request: Fetcher["fetch"];
	render: MapshotWorkerContainerPortal["render"];
	close: MapshotWorkerContainerPortal["close"];
	channel: MapshotWorkerContainerPortal;
	context: ConstructorParameters<typeof MapshotContainer>[0];
} {
	let stopped = Promise.withResolvers<void>();
	const request = td.func<Fetcher["fetch"]>();
	const channel = td.object<MapshotWorkerContainerPortal>();
	const container = td.object<{ -readonly [Key in keyof Container]: Container[Key] }>();
	const start = td.func<Container["start"]>();
	const signal = td.func<Container["signal"]>();
	const lifecycle = { stopOnSignal: true };
	const destroy = td.func<Container["destroy"]>();
	container.running = params.running ?? false;
	const port = td.object<Fetcher>();
	port.fetch = request;
	td.when(request(td.matchers.anything(), td.matchers.anything())).thenDo(async (): Promise<Response> => _health());
	td.when(channel.render(td.matchers.anything())).thenDo(async (): Promise<ContainerRenderOutput> => _output());
	td.when(channel.close()).thenDo(async (): Promise<void> => {
		_events.push("close");
	});
	td.when(channel.withOptions(td.matchers.anything())).thenReturn(channel);
	td.when(destroy()).thenResolve();
	container.start = (options): void => {
		_events.push("start");
		start(options);
		stopped = Promise.withResolvers<void>();
		container.running = true;
	};
	td.when(container.monitor()).thenDo((): Promise<void> => stopped.promise);
	container.signal = (signo): void => {
		_events.push("signal");
		signal(signo);
		if (!lifecycle.stopOnSignal) return;
		container.running = false;
		stopped.resolve();
	};
	container.destroy = async (): Promise<void> => {
		await destroy();
		container.running = false;
	};
	td.when(container.getTcpPort(td.matchers.anything())).thenReturn(port);
	_channels.set(container, channel);
	const context = td.object<ConstructorParameters<typeof MapshotContainer>[0]>();
	td.replace(context, "container", params.missing ? undefined : container);
	td.when(context.blockConcurrencyWhile(td.matchers.anything())).thenDo(
		(operation: () => Promise<unknown>): Promise<unknown> => operation(),
	);
	const env = td.object<MapshotWorkerEnv>();
	td.replace(env, "SLEEP_AFTER_MS", params.production ? undefined : 600_000);
	const coordinator = new MapshotContainer(context, env);
	return {
		coordinator: coordinator,
		container: container,
		start: start,
		signal: signal,
		lifecycle: lifecycle,
		destroy: destroy,
		request: request,
		render: channel.render,
		close: channel.close,
		channel: channel,
		context: context,
	};
}
function _timers(): void {
	vi.useFakeTimers();
	const timeout = td.replace(AbortSignal, "timeout");
	td.when(timeout(td.matchers.anything())).thenDo((milliseconds: number): AbortSignal => {
		const controller = new AbortController();
		setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), milliseconds);
		return controller.signal;
	});
}
afterEach(() => td.reset());
beforeEach(() => {
	_events.length = 0;
	td.when(_workerhole.create(td.matchers.anything(), td.matchers.anything())).thenDo(
		(
			_definition: typeof MapshotWorkerContainerPortal,
			params: ConnectToContainerOptions,
		): MapshotWorkerContainerPortal => {
			_events.push("endpoint");
			const channel = _channels.get(params.context.container!);
			if (channel === undefined) throw new Error("Missing test channel.");
			return channel;
		},
	);
	vi.stubGlobal("scheduler", {
		wait: (milliseconds: number): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
	});
	td.replace(console, "warn");
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe("typed container rendering", () => {
	it("forwards render work without imposing its own operation deadline", async () => {
		const state = _coordinator();
		await expect(_render(state.coordinator)).resolves.toEqual(_result);
		expect(td.explain(state.channel.withOptions).callCount).toBe(0);
		td.verify(state.render(_input));
	});

	it("forwards a burst to the container while earlier render calls are still pending", async () => {
		const state = _coordinator();
		const result = Promise.withResolvers<void>();
		td.when(state.render(td.matchers.anything())).thenDo(async (): Promise<ContainerRenderOutput> => {
			await result.promise;
			return _output();
		});
		const renders = Array.from({ length: 10 }, () => _render(state.coordinator));
		const settled = Promise.allSettled(renders);
		try {
			await vi.waitFor(() => expect(td.explain(state.render).callCount).toBe(10), { timeout: 200 });
			expect(td.explain(state.start).callCount).toBe(1);
			expect(td.explain(state.request).callCount).toBe(1);
		} finally {
			result.resolve();
			await settled;
		}
	});
	it("registers a fresh endpoint after the native container stops unexpectedly", async () => {
		const state = _coordinator();
		await _render(state.coordinator);
		state.container.running = false;
		await state.coordinator.onStop();
		expect(td.explain(state.close).callCount).toBe(1);
		await _render(state.coordinator);
		expect(td.explain(_workerhole.create).callCount).toBe(2);
	});
	it("registers its endpoint on demand before startup and reuses it for subsequent renders", async () => {
		const state = _coordinator();
		expect(td.explain(_workerhole.create).callCount).toBe(0);
		await _render(state.coordinator);
		await _render(state.coordinator);
		expect(td.explain(_workerhole.create).callCount).toBe(1);
		expect(_events.indexOf("endpoint")).toBeLessThan(_events.indexOf("start"));
	});
	it("registers a new endpoint on startup after idle shutdown closes the previous endpoint", async () => {
		const state = _coordinator();
		await _render(state.coordinator);
		await state.coordinator.onActivityExpired();
		expect(td.explain(state.close).callCount).toBe(1);
		await _render(state.coordinator);
		expect(td.explain(_workerhole.create).callCount).toBe(2);
		expect(td.explain(state.render).callCount).toBe(2);
	});
	it("checks health and sends a typed render without imposing a render deadline", async () => {
		const state = _coordinator();
		expect(await _render(state.coordinator)).toEqual(_result);
		expect(state.coordinator.defaultPort).toBe(ContainerConfig.port);
		expect(td.explain(_workerhole.create).calls[0]?.args[0]).toBe(MapshotWorkerContainerPortal);
		expect(td.explain(_workerhole.create).calls[0]?.args[1]).not.toHaveProperty("port");
		expect(
			td.explain(_workerhole.create).calls.map((call) => ({
				contextMatches: call.args[1].context === state.context,
				exposeMatches: call.args[1].expose === MapshotWorkerPortal,
			})),
		).toEqual([{ contextMatches: true, exposeMatches: true }]);
		expect(td.explain(state.start).calls.map((call) => call.args)).toEqual([[{ enableInternet: false }]]);
		expect(td.explain(state.container.getTcpPort).calls.map((call) => call.args)).toContainEqual([
			ContainerConfig.port,
		]);
		expect(td.explain(state.request).callCount).toBe(1);
		expect(td.explain(state.channel.withOptions).callCount).toBe(0);
		expect(td.explain(state.render).calls.map((call) => call.args)).toEqual([[_input]]);
		expect(td.explain(state.context.waitUntil).callCount).toBe(0);
	});
	it("trusts the producer's typed image metadata", async () => {
		const state = _coordinator();
		const result = { ..._result, metadata: { ..._result.metadata, futureField: true } };
		td.when(state.render(td.matchers.anything())).thenResolve({ ..._output(), metadata: result.metadata });
		expect(await _render(state.coordinator)).toEqual(result);
	});
	it("propagates a remote rendering error unchanged", async () => {
		const state = _coordinator();
		const failure = new RemoteError({
			name: "InvalidRenderingResourceError",
			message: "Private detail",
			errorCode: "INVALID_RESOURCE",
		});
		td.when(state.render(td.matchers.anything())).thenReject(failure);
		await expect(_render(state.coordinator)).rejects.toBe(failure);
	});
	it("does not retry failed portal setup through the retired HTTP render endpoint", async () => {
		const state = _coordinator();
		const failure = new RemoteError({ name: "Error", message: "Failed" });
		td.when(state.render(td.matchers.anything())).thenReject(failure);
		await expect(_render(state.coordinator)).rejects.toBe(failure);
		expect(td.explain(state.request).callCount).toBe(1);
		expect(td.explain(state.render).callCount).toBe(1);
	});
	it("propagates an unknown remote rendering code unchanged", async () => {
		const state = _coordinator();
		const failure = new RemoteError({ name: "Error", message: "Private", errorCode: "unknown" });
		td.when(state.render(td.matchers.anything())).thenReject(failure);
		await expect(_render(state.coordinator)).rejects.toBe(failure);
	});
	it("propagates a rendering deadline timeout unchanged", async () => {
		const state = _coordinator();
		const failure = new DOMException("Private", "TimeoutError");
		td.when(state.render(td.matchers.anything())).thenReject(failure);
		await expect(_render(state.coordinator)).rejects.toBe(failure);
	});

	it("reports a missing container without attempting a render", async () => {
		const state = _coordinator({ missing: true });
		await expect(_render(state.coordinator)).rejects.toMatchObject({ name: "ContainerUnavailableError" });
		expect(td.explain(state.render).callCount).toBe(0);
	});
	it("propagates the container's closed-renderer rejection unchanged", async () => {
		const state = _coordinator();
		const failure = new RemoteError({
			name: "RenderingClosedError",
			message: "Rendering has closed.",
			errorCode: "CLOSED",
		});
		td.when(state.render(td.matchers.anything())).thenReject(failure);
		await expect(_render(state.coordinator)).rejects.toBe(failure);
	});
});

describe("readiness and recovery", () => {
	it("shares readiness across concurrent renders and retries a temporary health failure", async () => {
		_timers();
		const state = _coordinator();
		td.when(state.request(td.matchers.anything(), td.matchers.anything()), { times: 1 }).thenReject(
			new Error("Not listening"),
		);
		const pending = [_render(state.coordinator), _render(state.coordinator)];
		await vi.advanceTimersByTimeAsync(100);
		await Promise.all(pending);
		expect(td.explain(state.start).callCount).toBe(1);
		expect(td.explain(state.request).callCount).toBe(2);
	});
	it("rechecks health after the process stops", async () => {
		const state = _coordinator();
		await _render(state.coordinator);
		state.container.running = false;
		await _render(state.coordinator);
		expect(td.explain(state.start).callCount).toBe(2);
		expect(td.explain(state.request).callCount).toBe(2);
	});
	it("clears failed startup so subsequent demand can retry", async () => {
		const state = _coordinator();
		td.when(state.start(td.matchers.anything()), { times: 1 }).thenDo((): never => {
			throw new Error("Allocation failed");
		});
		await expect(_render(state.coordinator)).rejects.toMatchObject({ name: "ContainerReadinessFailedError" });
		await expect(_render(state.coordinator)).resolves.toEqual(_result);
	});
	it("shares a failed startup and waits for destruction before later demand starts a replacement", async () => {
		_timers();
		const state = _coordinator();
		const destroyed = Promise.withResolvers<void>();
		td.when(state.request(td.matchers.anything(), td.matchers.anything())).thenDo(
			async (): Promise<Response> => new Response(null, { status: 503 }),
		);
		td.when(state.destroy(), { times: 1 }).thenDo(async (): Promise<void> => {
			await destroyed.promise;
			state.container.running = false;
		});
		const first = _render(state.coordinator);
		const failed = expect(first).rejects.toMatchObject({ name: "ContainerOperationTimedOutError" });
		const second = _render(state.coordinator);
		const alsoFailed = expect(second).rejects.toMatchObject({ name: "ContainerOperationTimedOutError" });
		await vi.advanceTimersByTimeAsync(20_000);
		expect(td.explain(state.destroy).callCount).toBe(1);
		expect(td.explain(state.render).callCount).toBe(0);
		expect(td.explain(state.start).callCount).toBe(1);
		td.when(state.request(td.matchers.anything(), td.matchers.anything())).thenDo(
			async (): Promise<Response> => _health(),
		);
		destroyed.resolve();
		await vi.advanceTimersByTimeAsync(0);
		await Promise.all([failed, alsoFailed]);
		await expect(_render(state.coordinator)).resolves.toEqual(_result);
		expect(td.explain(state.start).callCount).toBe(2);
	});
	it("bounds a stuck health request and permits later demand", async () => {
		_timers();
		const state = _coordinator();
		td.when(state.request(td.matchers.anything(), td.matchers.anything())).thenDo(
			(): Promise<Response> => new Promise(() => undefined),
		);
		const pending = expect(_render(state.coordinator)).rejects.toMatchObject({
			name: "ContainerReadinessFailedError",
		});
		await vi.advanceTimersByTimeAsync(20_001);
		await pending;
		expect(td.explain(state.destroy).callCount).toBe(1);
		td.when(state.request(td.matchers.anything(), td.matchers.anything())).thenDo(
			async (): Promise<Response> => _health(),
		);
		await expect(_render(state.coordinator)).resolves.toEqual(_result);
	});
	it("retries a failed destruction on later real demand", async () => {
		const state = _coordinator({ running: true, production: true });
		td.when(state.request(td.matchers.anything(), td.matchers.anything()), { times: 1 }).thenReject(
			new Error("Unhealthy"),
		);
		td.when(state.destroy(), { times: 1 }).thenReject(new Error("Destroy failed"));
		await state.coordinator.onActivityExpired();
		await vi.waitFor(() => expect(td.explain(state.destroy).callCount).toBe(1));
		await td.explain(state.context.waitUntil).calls.at(-1)?.args[0];
		await expect(_render(state.coordinator)).resolves.toEqual(_result);
		expect(td.explain(state.destroy).callCount).toBe(2);
	});
});

describe("idle lifecycle", () => {
	it("delivers an image through a BYOB reader and releases its final empty read", async () => {
		const state = _coordinator({ running: true });
		const result = await state.coordinator.render(_input);
		const reader = result.bytes.getReader({ mode: "byob" });
		const bytes: number[] = [];
		while (true) {
			const chunk = await reader.read(new Uint8Array(2));
			if (chunk.done) break;
			bytes.push(...chunk.value);
		}
		reader.releaseLock();
		expect(bytes).toEqual([1, 2, 3]);
		await state.coordinator.onActivityExpired();
		td.verify(state.close());
	});

	it.each(["complete", "cancel", "error"] as const)(
		"keeps the container active until an image stream ends through %s",
		async (outcome) => {
			const state = _coordinator({ running: true });
			let source: ReadableStreamDefaultController<Uint8Array> | undefined;
			const cancel = td.func<(reason: unknown) => Promise<void>>();
			td.when(cancel(td.matchers.anything())).thenResolve();
			const output = {
				bytes: new ReadableStream<Uint8Array>({
					start(controller): void {
						source = controller;
					},
					cancel: cancel,
				}),
				metadata: _result.metadata,
			} satisfies ContainerRenderOutput;
			td.when(state.render(td.matchers.anything())).thenDo(async (): Promise<ContainerRenderOutput> => output);
			const renew = vi.spyOn(state.coordinator, "renewActivityTimeout");
			const result = await state.coordinator.render(_input);
			const reader = result.bytes.getReader({ mode: "byob" });
			reader.releaseLock();
			await state.coordinator.onActivityExpired();
			expect(td.explain(state.close).callCount).toBe(0);
			expect(renew).not.toHaveBeenCalled();
			if (source === undefined) throw new Error("Expected the source stream to start.");
			switch (outcome) {
				case "complete":
					source.enqueue(Uint8Array.of(1, 2, 3));
					source.close();
					expect(new Uint8Array(await new Response(result.bytes).arrayBuffer())).toEqual(_result.bytes);
					break;
				case "cancel":
					await result.bytes.cancel("Caller stopped reading.");
					td.verify(cancel("Caller stopped reading."));
					break;
				case "error": {
					const failure = new Error("Image transfer failed.");
					source.error(failure);
					await expect(new Response(result.bytes).arrayBuffer()).rejects.toBe(failure);
					break;
				}
			}
			expect(renew).toHaveBeenCalledOnce();
			await state.coordinator.onActivityExpired();
			td.verify(state.close());
		},
	);

	it("releases image delivery when source cancellation fails", async () => {
		const state = _coordinator({ running: true });
		const failure = new Error("Source already disconnected.");
		const cancel = td.func<(reason: unknown) => Promise<void>>();
		td.when(cancel(td.matchers.anything())).thenReject(failure);
		const output = {
			bytes: new ReadableStream<Uint8Array>({ cancel: cancel }),
			metadata: _result.metadata,
		} satisfies ContainerRenderOutput;
		td.when(state.render(td.matchers.anything())).thenDo(async (): Promise<ContainerRenderOutput> => output);
		const result = await state.coordinator.render(_input);
		await expect(result.bytes.cancel()).rejects.toBe(failure);
		await state.coordinator.onActivityExpired();
		td.verify(state.close());
	});

	it("closes the channel before stopping an idle development container", async () => {
		const state = _coordinator({ running: true });
		await _render(state.coordinator);
		expect(state.coordinator.sleepAfter).toBe(600);
		await state.coordinator.onActivityExpired();
		expect(td.explain(state.close).callCount).toBe(1);
		td.verify(state.signal(15));
		expect(_events.indexOf("close")).toBeLessThan(_events.indexOf("signal"));
	});
	it("keeps new demand behind an unfinished idle stop", async () => {
		const state = _coordinator({ running: true });
		const stopped = Promise.withResolvers<void>();
		td.when(state.container.monitor(), { times: 1 }).thenReturn(stopped.promise);
		state.lifecycle.stopOnSignal = false;
		const expiry = state.coordinator.onActivityExpired();
		await vi.waitFor(() => expect(td.explain(state.signal).callCount).toBe(1));
		const render = _render(state.coordinator);
		await state.coordinator.onActivityExpired();
		expect(td.explain(state.render).callCount).toBe(0);
		state.container.running = false;
		stopped.resolve();
		await expiry;
		await expect(render).resolves.toEqual(_result);
	});
	it("bounds demand waiting for idle channel cleanup and permits rendering after cleanup finishes", async () => {
		_timers();
		const state = _coordinator({ running: true });
		await _render(state.coordinator);
		const closed = Promise.withResolvers<void>();
		td.when(state.close(), { times: 1 }).thenDo((): Promise<void> => closed.promise);
		const stopping = state.coordinator.onActivityExpired();
		const render = expect(_render(state.coordinator)).rejects.toMatchObject({
			name: "ContainerOperationTimedOutError",
		});
		await vi.advanceTimersByTimeAsync(20_000);
		await render;
		expect(td.explain(state.render).callCount).toBe(1);
		expect(td.explain(state.signal).callCount).toBe(0);
		closed.resolve();
		await stopping;
		await expect(_render(state.coordinator)).resolves.toEqual(_result);
		expect(td.explain(state.signal).calls.map((call) => call.args)).toEqual([[15]]);
	});
	it.each(["signal", "monitor"] as const)("reports idle shutdown %s failures", async (method) => {
		const state = _coordinator({ running: true });
		const failure = new Error("Private details");
		if (method === "signal") td.when(state.signal(td.matchers.anything()), { times: 1 }).thenThrow(failure);
		else
			td.when(state.container.monitor(), { times: 1 }).thenDo((): never => {
				throw failure;
			});
		await expect(state.coordinator.onActivityExpired()).rejects.toMatchObject({ name: "ContainerShutdownFailedError" });
	});
	it.each([false, true])("does not start idle stopped or missing containers: %s", async (missing) => {
		const state = _coordinator({ missing: missing });
		await state.coordinator.onActivityExpired();
		expect(td.explain(state.start).callCount).toBe(0);
		expect(td.explain(state.request).callCount).toBe(0);
	});
	it("does not run idle health during pending readiness or accepted rendering", async () => {
		const state = _coordinator({ production: true });
		const ready = Promise.withResolvers<Response>();
		const result = Promise.withResolvers<ContainerRenderOutput>();
		td.when(state.request(td.matchers.anything(), td.matchers.anything()), { times: 1 }).thenDo(
			(): Promise<Response> => ready.promise,
		);
		td.when(state.render(td.matchers.anything()), { times: 1 }).thenDo(
			(): Promise<ContainerRenderOutput> => result.promise,
		);
		const pending = _render(state.coordinator);
		await vi.waitFor(() => expect(td.explain(state.request).callCount).toBe(1));
		await state.coordinator.onActivityExpired();
		ready.resolve(_health());
		await vi.waitFor(() => expect(td.explain(state.render).callCount).toBe(1));
		const renew = vi.spyOn(state.coordinator, "renewActivityTimeout");
		await state.coordinator.onActivityExpired();
		expect(td.explain(state.request).callCount).toBe(1);
		expect(renew).not.toHaveBeenCalled();
		result.resolve(_output());
		await pending;
		expect(renew).toHaveBeenCalledOnce();
		await state.coordinator.onActivityExpired();
		expect(td.explain(state.request).callCount).toBe(2);
	});
	it.each([false, true])(
		"waits for every concurrent render before idle lifecycle resumes: production=%s",
		async (production) => {
			const state = _coordinator({ production: production });
			const first = Promise.withResolvers<ContainerRenderOutput>();
			const second = Promise.withResolvers<ContainerRenderOutput>();
			td.when(state.render(td.matchers.anything())).thenReturn(first.promise, second.promise);
			const renders = [_render(state.coordinator), _render(state.coordinator)];
			try {
				await vi.waitFor(() => expect(td.explain(state.render).callCount).toBe(2));
				await state.coordinator.onActivityExpired();
				first.resolve(_output());
				await renders[0];
				await state.coordinator.onActivityExpired();
				expect(td.explain(state.request).callCount).toBe(1);
				expect(td.explain(state.close).callCount).toBe(0);
				expect(td.explain(state.signal).callCount).toBe(0);
				second.resolve(_output());
				await renders[1];
				await state.coordinator.onActivityExpired();
				expect(td.explain(state.request).callCount).toBe(production ? 2 : 1);
				expect(td.explain(state.signal).callCount).toBe(production ? 0 : 1);
			} finally {
				first.resolve(_output());
				second.resolve(_output());
				await Promise.allSettled(renders);
			}
		},
	);
	it("keeps a healthy production container warm", async () => {
		const state = _coordinator({ running: true, production: true });
		expect(state.coordinator.sleepAfter).toBe(60);
		await state.coordinator.onActivityExpired();
		expect(td.explain(state.signal).callCount).toBe(0);
		expect(td.explain(state.destroy).callCount).toBe(0);
	});
	it("destroys an unhealthy warm container and starts a replacement only on demand", async () => {
		const state = _coordinator({ running: true, production: true });
		td.when(state.request(td.matchers.anything(), td.matchers.anything()), { times: 1 }).thenReject(
			new Error("Unhealthy"),
		);
		await state.coordinator.onActivityExpired();
		await vi.waitFor(() => expect(td.explain(state.destroy).callCount).toBe(1));
		expect(td.explain(state.start).callCount).toBe(0);
		await expect(_render(state.coordinator)).resolves.toEqual(_result);
	});
	it.each(["running", "completed"])("preserves a %s render when an old idle probe fails", async (stage) => {
		const state = _coordinator({ production: true });
		await _render(state.coordinator);
		const health = Promise.withResolvers<Response>();
		const result = Promise.withResolvers<ContainerRenderOutput>();
		td.when(state.request(td.matchers.anything(), td.matchers.anything()), { times: 1 }).thenDo(
			(): Promise<Response> => health.promise,
		);
		const probe = state.coordinator.onActivityExpired();
		td.when(state.render(td.matchers.anything()), { times: 1 }).thenDo(
			(): Promise<ContainerRenderOutput> => result.promise,
		);
		const render = _render(state.coordinator);
		await vi.waitFor(() => expect(td.explain(state.render).callCount).toBe(2));
		if (stage === "completed") {
			result.resolve(_output());
			await render;
		}
		health.reject(new Error("Late health failure"));
		await probe;
		expect(td.explain(state.destroy).callCount).toBe(0);
		result.resolve(_output());
		await render;
	});
	it("bounds an idle health request and cancels its late response body", async () => {
		_timers();
		const state = _coordinator({ running: true, production: true });
		const health = Promise.withResolvers<Response>();
		td.when(state.request(td.matchers.anything(), td.matchers.anything()), { times: 1 }).thenDo(
			(): Promise<Response> => health.promise,
		);
		const probe = state.coordinator.onActivityExpired();
		await vi.advanceTimersByTimeAsync(2001);
		await probe;
		const response = new Response("late");
		const cancel = vi.spyOn(response.body!, "cancel");
		health.resolve(response);
		await vi.advanceTimersByTimeAsync(0);
		expect(cancel).toHaveBeenCalledOnce();
	});
	it("reports an SDK runtime failure independently of renders", () => {
		expect(() => _coordinator().coordinator.onError(new Error("Private"))).toThrow(
			expect.objectContaining({ name: "ContainerRuntimeFailedError" }),
		);
	});
});

it("absorbs cancellation failure from a discarded late health response", async () => {
	_timers();
	const state = _coordinator({ running: true, production: true });
	const health = Promise.withResolvers<Response>();
	td.when(state.request(td.matchers.anything(), td.matchers.anything()), { times: 1 }).thenDo(
		(): Promise<Response> => health.promise,
	);
	const probe = state.coordinator.onActivityExpired();
	await vi.advanceTimersByTimeAsync(2_001);
	await probe;
	const response = new Response("late");
	const cancel = td.replace(response.body!, "cancel");
	td.when(cancel()).thenReject(new Error("Closed"));
	health.resolve(response);
	await vi.advanceTimersByTimeAsync(0);
	expect(td.explain(cancel).callCount).toBe(1);
});

it("keeps new renders behind idle shutdown while the portal channel is still closing", async () => {
	const state = _coordinator({ running: true });
	await _render(state.coordinator);

	const closed = Promise.withResolvers<void>();
	td.when(state.close(), { times: 1 }).thenDo((): Promise<void> => closed.promise);
	const stopping = state.coordinator.onActivityExpired();
	const render = _render(state.coordinator);
	await new Promise<void>((resolve) => setTimeout(resolve, 0));
	expect(td.explain(state.request).callCount).toBe(1);
	expect(td.explain(state.render).callCount).toBe(1);
	closed.resolve();
	await stopping;
	await expect(render).resolves.toEqual(_result);
	expect(td.explain(state.start).callCount).toBe(1);
});

it("preserves cancellation errors instead of misreporting them as render timeouts", async () => {
	const state = _coordinator();
	const cancelled = new DOMException("Cancelled", "AbortError");
	td.when(state.render(td.matchers.anything()), { times: 1 }).thenReject(cancelled);
	await expect(_render(state.coordinator)).rejects.toBe(cancelled);
});

it("keeps recovery gated until both destruction and channel cleanup finish after a failure", async () => {
	const state = _coordinator({ running: true, production: true });
	await _render(state.coordinator);

	const closed = Promise.withResolvers<void>();
	td.when(state.close(), { times: 1 }).thenDo((): Promise<void> => closed.promise);
	td.when(state.destroy(), { times: 1 }).thenReject(new Error("Destroy failed"));
	td.when(state.request(td.matchers.anything(), td.matchers.anything()), { times: 1 }).thenReject(
		new Error("Unhealthy"),
	);
	await state.coordinator.onActivityExpired();
	await vi.waitFor(() => expect(td.explain(state.destroy).callCount).toBe(1));
	const render = expect(_render(state.coordinator)).rejects.toMatchObject({
		name: "ContainerShutdownFailedError",
	});
	await new Promise<void>((resolve) => setTimeout(resolve, 0));
	expect(td.explain(state.destroy).callCount).toBe(1);
	expect(td.explain(state.render).callCount).toBe(1);
	closed.resolve();
	await render;
	await expect(_render(state.coordinator)).resolves.toEqual(_result);
	expect(td.explain(state.destroy).callCount).toBe(2);
});

it("gives renders waiting for shutdown the same owned failure as idle expiry", async () => {
	const state = _coordinator({ running: true });
	await _render(state.coordinator);
	const closed = Promise.withResolvers<void>();
	td.when(state.close(), { times: 1 }).thenDo((): Promise<void> => closed.promise);
	const stopping = expect(state.coordinator.onActivityExpired()).rejects.toMatchObject({
		name: "ContainerShutdownFailedError",
	});
	const render = expect(_render(state.coordinator)).rejects.toMatchObject({
		name: "ContainerShutdownFailedError",
	});
	closed.reject(new Error("Private transport failure"));
	await Promise.all([stopping, render]);
});

it("bounds each stalled health fetch without waiting for the whole startup deadline", async () => {
	_timers();
	const state = _coordinator();
	const health = Promise.withResolvers<Response>();
	td.when(state.request(td.matchers.anything(), td.matchers.anything()), { times: 1 }).thenDo(
		(): Promise<Response> => health.promise,
	);
	const render = _render(state.coordinator);
	await vi.advanceTimersByTimeAsync(2_101);
	await expect(render).resolves.toEqual(_result);
	expect(td.explain(state.request).callCount).toBe(2);
	const response = new Response("late");
	const cancel = vi.spyOn(response.body!, "cancel");
	health.resolve(response);
	await vi.advanceTimersByTimeAsync(0);
	expect(cancel).toHaveBeenCalledOnce();
});

it("accepts the owned health endpoint's successful status without reparsing its body", async () => {
	const state = _coordinator();
	const response = new Response(null, { status: 204 });
	const parse = vi.spyOn(response, "json");
	td.when(state.request(td.matchers.anything(), td.matchers.anything()), { times: 1 }).thenResolve(response);
	await expect(_render(state.coordinator)).resolves.toEqual(_result);
	expect(parse).not.toHaveBeenCalled();
});

it("observes health body cancellation failure when cancellation itself reaches the startup deadline", async () => {
	vi.useFakeTimers();
	const state = _coordinator();
	const response = new Response("health");
	if (response.body === null) throw new Error("Expected a health body.");
	const cancel = td.replace(response.body, "cancel");
	td.when(cancel()).thenDo((): Promise<void> => {
		vi.advanceTimersByTime(20_000);
		return Promise.reject(new Error("Cancellation failed after deadline"));
	});
	td.when(state.request(td.matchers.anything(), td.matchers.anything()), { times: 1 }).thenResolve(response);
	await expect(_render(state.coordinator)).rejects.toMatchObject({ errorCode: "CONTAINER_READINESS_FAILED" });
	expect(td.explain(cancel).callCount).toBe(1);
});
