import { once } from "node:events";
import { createServer } from "node:http";
import { newWebSocketRpcSession } from "capnweb";
import * as td from "testdouble";
import { afterEach, describe, expect, it } from "vitest";
import { Address } from "./address";
import type { ConnectToContainerOptions, ConnectToWorkerOptions } from "./connection.types";
import type { Dispatcher } from "./dispatcher";
import { PortalUnavailableError } from "./errors";
import { connectContainerToWorker as containerInUnknown, connectWorkerToContainer as workerInUnknown } from "./index";
import {
	connectContainerToWorker,
	defineWorkerContainerPortal,
	defineWorkerPortal,
	connectWorkerToContainer as workerInNode,
} from "./index.node";
import { connectWorkerToContainer, connectContainerToWorker as containerInWorker } from "./index.worker";
import type { createWorkerAdapter } from "./worker-adapter";
import type { CallContext } from "./types";

abstract class WorkerDefinition extends defineWorkerPortal<{
	read(input: string, context: CallContext): Promise<Uint8Array>;
}>() {}

abstract class ContainerDefinition extends defineWorkerContainerPortal<{
	render(input: { size: number }, context: CallContext): Promise<void>;
}>() {}

class LocalPortal {
	readonly expose = {};
}

afterEach(() => td.reset());

it.each([workerInNode, workerInUnknown])("rejects Worker connections outside their runtime", (connect): void => {
	expect(() => connect(ContainerDefinition, td.object<ConnectToContainerOptions>())).toThrow(
		"must be created in Cloudflare Workers",
	);
});

it.each([containerInWorker, containerInUnknown])(
	"rejects container connections outside their runtime",
	(connect): void => {
		expect(() => connect(WorkerDefinition, td.object<ConnectToWorkerOptions>())).toThrow(
			"require a container runtime with Node-compatible APIs",
		);
	},
);

describe("directional connectors", () => {
	it("rejects a missing portal export before registering container routing", () => {
		const container = td.object<Container>();
		const context = {
			exports: {},
			container: container,
			blockConcurrencyWhile: td.func<ConnectToContainerOptions["context"]["blockConcurrencyWhile"]>(),
		} satisfies ConnectToContainerOptions["context"];
		expect(() =>
			connectWorkerToContainer(ContainerDefinition, {
				context: context,
				expose: LocalPortal,
			}),
		).toThrow("Workerhole portal must be exported using its class name.");
		expect(td.explain(context.blockConcurrencyWhile).callCount).toBe(0);
		expect(td.explain(container.interceptOutboundHttp).callCount).toBe(0);
	});
	it("connects to the container through the reserved high port and workerhole path", async () => {
		const container = td.object<Container>();
		const port = td.object<ReturnType<Container["getTcpPort"]>>();
		const binding = td.func<Parameters<typeof createWorkerAdapter>[0]["expose"]>();
		const context = {
			exports: { LocalPortal: binding },
			container: container,
			blockConcurrencyWhile: td.func<ConnectToContainerOptions["context"]["blockConcurrencyWhile"]>(),
		} satisfies ConnectToContainerOptions["context"];
		td.when(context.blockConcurrencyWhile(td.matchers.anything())).thenDo(
			(callback: () => Promise<void>): Promise<void> => callback(),
		);
		td.when(container.interceptOutboundHttp(td.matchers.anything(), td.matchers.anything())).thenResolve(undefined);
		td.when(container.getTcpPort(td.matchers.anything())).thenReturn(port);
		td.when(port.fetch(td.matchers.anything(), td.matchers.anything())).thenResolve(new Response(null));
		const client = connectWorkerToContainer(ContainerDefinition, {
			context: context,
			expose: LocalPortal,
		});
		try {
			await expect(client.render({ size: 1 })).rejects.toBeInstanceOf(PortalUnavailableError);
			expect({
				ports: td.explain(container.getTcpPort).calls.map((call) => call.args),
				requests: td.explain(port.fetch).calls.map((call) => call.args),
			}).toEqual({
				ports: [[61357]],
				requests: [["http://container/internal/workerhole", { headers: { upgrade: "websocket" } }]],
			});
		} finally {
			await client.close();
		}
	});

	it("registers the local Node expose in one call and closes it through the configured client", async () => {
		const client: WorkerDefinition = await connectContainerToWorker(WorkerDefinition, {
			expose: {
				expose: {
					render: async (_input: { size: number }, _context: CallContext): Promise<void> => undefined,
				},
			},
		});
		expect((await fetch(`http://127.0.0.1:${Address.port}/`)).status).toBe(404);
		await client.withOptions({ timeoutMs: 100 }).close();
		await expect(fetch(`http://127.0.0.1:${Address.port}/`)).rejects.toThrow();
		await expect(client.close()).resolves.toBeUndefined();
		await expect(client.read("closed")).rejects.toThrow("closed");
	});

	it("registers the Worker binding once and defers container network access until the first call", async () => {
		const container = td.object<Container>();
		const binding = td.func<Parameters<typeof createWorkerAdapter>[0]["expose"]>();
		const context = {
			exports: { LocalPortal: binding },
			container: container,
			blockConcurrencyWhile: td.func<ConnectToContainerOptions["context"]["blockConcurrencyWhile"]>(),
		} satisfies ConnectToContainerOptions["context"];
		td.when(container.interceptOutboundHttp(td.matchers.anything(), td.matchers.anything())).thenResolve(undefined);
		td.when(context.blockConcurrencyWhile(td.matchers.anything())).thenDo(
			(callback: () => Promise<void>): Promise<void> => callback(),
		);
		const client: ContainerDefinition = connectWorkerToContainer(ContainerDefinition, {
			context: context,
			expose: LocalPortal,
		});
		expect(td.explain(container.interceptOutboundHttp).callCount).toBe(1);
		expect(td.explain(container.getTcpPort).callCount).toBe(0);
		await client.close();
		expect(td.explain(container.getTcpPort).callCount).toBe(0);
	});
});

it("rejects startup when the package-owned Workerhole port is already occupied", async () => {
	const occupied = createServer();
	occupied.listen(Address.port, "0.0.0.0");
	await once(occupied, "listening");
	try {
		await expect(connectContainerToWorker(WorkerDefinition, { expose: { expose: {} } })).rejects.toMatchObject({
			code: "EADDRINUSE",
		});
	} finally {
		await new Promise<void>((resolve, reject) =>
			occupied.close((error) => (error === undefined ? resolve() : reject(error))),
		);
	}
	const client = await connectContainerToWorker(WorkerDefinition, {
		expose: { expose: {} },
	});
	await client.close();
});

it("cleans up a rejected registration before binding the listener", async () => {
	await expect(
		connectContainerToWorker(WorkerDefinition, {
			expose: { expose: {} },
			idleTimeoutMs: 0,
		}),
	).rejects.toThrow(RangeError);
	const client = await connectContainerToWorker(WorkerDefinition, {
		expose: { expose: {} },
	});
	await client.close();
});

it.each([0, -1, 1.5, Infinity, NaN, 2_147_483_648])(
	"rejects an invalid idle policy before registering Worker routing: %s",
	(idleTimeoutMs) => {
		const container = td.object<Container>();
		const context = {
			exports: {},
			container: container,
			blockConcurrencyWhile: td.func<ConnectToContainerOptions["context"]["blockConcurrencyWhile"]>(),
		} satisfies ConnectToContainerOptions["context"];
		expect(() =>
			connectWorkerToContainer(ContainerDefinition, {
				context: context,
				expose: LocalPortal,
				idleTimeoutMs: idleTimeoutMs,
			}),
		).toThrow(RangeError);
		expect(td.explain(context.blockConcurrencyWhile).callCount).toBe(0);
		expect(td.explain(container.interceptOutboundHttp).callCount).toBe(0);
	},
);

it("keeps Workerhole off an unguarded public HTTP server while serving it on its own port", async () => {
	const publicServer = createServer((_request, response) => response.end("public application"));
	publicServer.listen(0, "127.0.0.1");
	await once(publicServer, "listening");
	const address = publicServer.address();
	if (address === null || typeof address === "string") throw new TypeError("Fixture requires a TCP listener.");
	const client = await connectContainerToWorker(WorkerDefinition, {
		expose: {
			expose: {
				render: async (_input: { size: number }, _context: CallContext): Promise<void> => undefined,
			},
		},
	});
	try {
		expect(publicServer.listenerCount("upgrade")).toBe(0);
		const publicSocket = new globalThis.WebSocket(`ws://127.0.0.1:${address.port}${Address.path}`);
		await new Promise<void>((resolve, reject) => {
			publicSocket.addEventListener("error", () => resolve(), { once: true });
			publicSocket.addEventListener("open", () => reject(new Error("Public HTTP exposed Workerhole")), { once: true });
		});
		const remote = newWebSocketRpcSession<Dispatcher>(`ws://127.0.0.1:${Address.port}${Address.path}`);
		try {
			const call = await remote.start({
				method: "render",
				args: [{ size: 10 }],
			});
			expect(await call.result()).toEqual({ ok: true, value: undefined });
			call[Symbol.dispose]();
		} finally {
			remote[Symbol.dispose]();
		}
	} finally {
		await client.close();
		await new Promise<void>((resolve, reject) =>
			publicServer.close((error) => (error === undefined ? resolve() : reject(error))),
		);
	}
});
