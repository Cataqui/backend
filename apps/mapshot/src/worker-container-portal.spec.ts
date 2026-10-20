import { RendererResponseInvalidError } from "./renderer/errors/renderer-response-invalid.error";
import { RendererRejectedError } from "./renderer/errors/renderer-rejected.error";
import {
	AppError,
	AppErrorCode,
	RenderingAbortedError,
	RenderingClosedError,
	InvalidRenderingResourceError,
	RenderingResourceUnavailableError,
} from "./errors/index";
import { ContainerNotReadyError } from "./health/errors/container-not-ready.error";
import type { MapshotWorkerContainerPortal as MapshotWorkerContainerPortalDefinition } from "@cataqui/mapshot-workerhole";
import * as td from "testdouble";
import { afterEach, expect, it } from "vitest";
import type { MapshotApplication } from "./application";

import { MapshotWorkerContainerPortal } from "./worker-container-portal";

type _Service = ConstructorParameters<typeof MapshotWorkerContainerPortal>[1];

afterEach(() => td.reset());

function _application(params: { ready: boolean; signal: AbortSignal }): MapshotApplication {
	const application = td.object<MapshotApplication>();
	Object.defineProperties(application, {
		ready: { get: (): boolean => params.ready && !params.signal.aborted },
		signal: { get: (): AbortSignal => params.signal },
	});
	return application;
}

it("rejects a new render after shutdown even when the service remains available", async () => {
	const service = td.object<_Service>();
	const shutdown = new AbortController();
	const portal = new MapshotWorkerContainerPortal(_application({ ready: true, signal: shutdown.signal }), service);
	shutdown.abort();
	await expect(
		portal.expose.render(
			{
				center: { latitude: -23.55, longitude: -46.63 },
				zoom: 13,
				size: { width: 480, height: 480 },
			},
			{ signal: new AbortController().signal },
		),
	).rejects.toMatchObject({ errorCode: AppErrorCode.NOT_READY });
	expect(td.explain(service.render).callCount).toBe(0);
});

it("rejects renders before readiness without calling the rendering service", async () => {
	const service = td.object<_Service>();
	const portal = new MapshotWorkerContainerPortal(
		_application({ ready: false, signal: new AbortController().signal }),
		service,
	);
	await expect(
		portal.expose.render(
			{
				center: { latitude: -23.55, longitude: -46.63 },
				zoom: 13,
				size: { width: 480, height: 480 },
			},
			{ signal: new AbortController().signal },
		),
	).rejects.toMatchObject({ errorCode: AppErrorCode.NOT_READY });
	expect(td.explain(service.render).callCount).toBe(0);
});

it("keeps caller cancellation independent and aborts all remaining renders on server shutdown", async () => {
	const service = td.object<_Service>();
	const signals: AbortSignal[] = [];
	td.when(service.render(td.matchers.anything())).thenDo(
		({ signal }: Parameters<_Service["render"]>[0]): ReturnType<_Service["render"]> => {
			if (signal === undefined) throw new TypeError("Expected rendering cancellation signal.");
			signals.push(signal);
			return new Promise((_resolve, reject) => {
				signal.addEventListener("abort", () => reject(new RenderingAbortedError()), { once: true });
			});
		},
	);
	const shutdown = new AbortController();
	const caller = new AbortController();
	const portal = new MapshotWorkerContainerPortal(_application({ ready: true, signal: shutdown.signal }), service);
	const input = {
		center: { latitude: -23.55, longitude: -46.63 },
		zoom: 13,
		size: { width: 480, height: 480 },
	} satisfies Parameters<MapshotWorkerContainerPortalDefinition["render"]>[0];
	const first = expect(portal.expose.render(input, { signal: caller.signal })).rejects.toMatchObject({
		errorCode: AppErrorCode.ABORTED,
	});
	const second = expect(portal.expose.render(input, { signal: new AbortController().signal })).rejects.toMatchObject({
		errorCode: AppErrorCode.ABORTED,
	});
	caller.abort();
	expect(signals.map((signal) => signal.aborted)).toEqual([true, false]);
	shutdown.abort();
	await Promise.all([first, second]);
	expect(signals.map((signal) => signal.aborted)).toEqual([true, true]);
});

it("streams the image service bytes and forwards the input with cancellation", async () => {
	const bytes = Uint8Array.of(1, 2, 3);
	const metadata = {
		contentType: "image/webp" as const,
		digest: "a".repeat(64),
		pixelWidth: 960,
		pixelHeight: 960,
	};
	const service = td.object<_Service>();
	const output = {
		bytes: bytes,
		metadata: metadata,
	} satisfies Awaited<ReturnType<_Service["render"]>>;
	td.when(service.render(td.matchers.anything())).thenResolve(output);
	const portal = new MapshotWorkerContainerPortal(
		_application({ ready: true, signal: new AbortController().signal }),
		service,
	);
	const input = {
		center: { latitude: -23.55, longitude: -46.63 },
		zoom: 13 as const,
		size: { width: 480, height: 480 },
	};
	const context = { signal: new AbortController().signal };
	const result = await portal.expose.render(input, context);
	expect(result.metadata).toBe(metadata);
	const reader = result.bytes.getReader({ mode: "byob" });
	reader.releaseLock();
	expect(new Uint8Array(await new Response(result.bytes).arrayBuffer())).toEqual(bytes);
	expect(td.explain(service.render).calls.map(({ args }) => args)).toEqual([
		[{ input: input, signal: expect.any(AbortSignal) }],
	]);
});

it.each([
	new RenderingAbortedError(),
	new RenderingClosedError(),
	new InvalidRenderingResourceError(),
	new RenderingResourceUnavailableError(),
	new RendererResponseInvalidError(),
	new RendererRejectedError(),
])("preserves the original Node-owned $name instance", async (failure) => {
	const service = td.object<_Service>();
	td.when(service.render(td.matchers.anything())).thenReject(failure);
	const portal = new MapshotWorkerContainerPortal(
		_application({ ready: true, signal: new AbortController().signal }),
		service,
	);
	const input = {
		center: { latitude: -23.55, longitude: -46.63 },
		zoom: 13,
		size: { width: 480, height: 480 },
	} satisfies Parameters<MapshotWorkerContainerPortalDefinition["render"]>[0];
	const context = { signal: new AbortController().signal };
	const operation = portal.expose.render(input, context);

	await expect(operation).rejects.toBe(failure);
});

it.each([new Error("Private failure"), null, { errorCode: "INVALID_RESOURCE", message: "Private failure" }])(
	"propagates an unknown service failure unchanged: %j",
	async (failure) => {
		const service = td.object<_Service>();
		td.when(service.render(td.matchers.anything())).thenReject(failure);
		const portal = new MapshotWorkerContainerPortal(
			_application({ ready: true, signal: new AbortController().signal }),
			service,
		);
		const input = {
			center: { latitude: -23.55, longitude: -46.63 },
			zoom: 13,
			size: { width: 480, height: 480 },
		} satisfies Parameters<MapshotWorkerContainerPortalDefinition["render"]>[0];

		await expect(portal.expose.render(input, { signal: new AbortController().signal })).rejects.toBe(failure);
	},
);

it("preserves the container readiness app error", async () => {
	const service = td.object<_Service>();
	const failure = new ContainerNotReadyError();
	td.when(service.render(td.matchers.anything())).thenReject(failure);
	const portal = new MapshotWorkerContainerPortal(
		_application({ ready: true, signal: new AbortController().signal }),
		service,
	);
	const input = {
		center: { latitude: -23.55, longitude: -46.63 },
		zoom: 13,
		size: { width: 480, height: 480 },
	} satisfies Parameters<MapshotWorkerContainerPortalDefinition["render"]>[0];

	await expect(portal.expose.render(input, { signal: new AbortController().signal })).rejects.toBe(failure);
	expect(failure).toBeInstanceOf(AppError);
	expect(failure).toMatchObject({
		name: "ContainerNotReadyError",
		errorCode: "NOT_READY",
		message: "The Mapshot container is not ready to render.",
	});
});
