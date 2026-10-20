import { DurableObject } from "cloudflare:workers";
import type { FixtureWorkerEnv } from "../cloudflare.config.ts";

import { WorkerPortal } from "@cataqui/workerhole/worker";
import { connectWorkerToContainer } from "@cataqui/workerhole";
import { WorkerApi, ContainerApi } from "./fixture-api";

export class FixtureWorker extends WorkerPortal<FixtureWorkerEnv, typeof WorkerApi> {
	override readonly expose: WorkerPortal<FixtureWorkerEnv, typeof WorkerApi>["expose"] = {
		greet: (input): string => input.message,
		resource: (): ReadableStream<Uint8Array> =>
			new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(new Uint8Array(65_536).fill(7));
					controller.enqueue(new Uint8Array(65_536).fill(8));
					controller.close();
				},
			}),
	};
}

export class FixtureContainer extends DurableObject<FixtureWorkerEnv> {
	private _connections = 0;
	private readonly _rpc = connectWorkerToContainer(ContainerApi, {
		context: {
			exports: this.ctx.exports,
			blockConcurrencyWhile: (callback) => this.ctx.blockConcurrencyWhile(callback),
			container: {
				getTcpPort: (port: number): Fetcher => {
					this._connections++;
					return this.ctx.container!.getTcpPort(port);
				},
				interceptOutboundHttp: (...args: Parameters<Container["interceptOutboundHttp"]>): Promise<void> =>
					this.ctx.container!.interceptOutboundHttp(...args),
			},
		},
		expose: FixtureWorker,
		idleTimeoutMs: 500,
	});

	async run(nodeFirst: boolean): Promise<object> {
		const container = this.ctx.container;
		if (container === undefined) throw new TypeError("Fixture requires a container.");
		if (!container.running)
			container.start({ enableInternet: false, env: { WORKERHOLE_NODE_FIRST: String(nodeFirst) } });
		let first = "";
		const deadline = Date.now() + 60_000;
		while (Date.now() < deadline) {
			try {
				first = await (await container.getTcpPort(8080).fetch("http://container/health")).text();
				if (first !== "pending") break;
			} catch {
				/* Cold fixture has not started its HTTP listener. */
			}
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
		const node = this._rpc.withOptions({ timeoutMs: 10_000 });
		const image = await node.render({ size: 1_048_576 });
		const initialConnections = this._connections;
		const reverse = await node.reverse();
		await this._rpc
			.withOptions({ timeoutMs: 100 })
			.stall(undefined)
			.catch(() => undefined);
		await new Promise((resolve) => setTimeout(resolve, 100));
		const cancelled = await node.aborted();
		await new Promise((resolve) => setTimeout(resolve, 650));
		const afterIdle = await node.render({ size: 17 });
		return {
			first: first,
			image: image.bytes.byteLength,
			correctBytes: image.bytes.every((byte) => byte === 137),
			reverse: reverse,
			cancelled: cancelled,
			afterIdle: afterIdle.bytes.byteLength,
			reconnected: this._connections > initialConnections,
		};
	}

	async publicFetch(request: Request): Promise<Response> {
		return this.ctx.container!.getTcpPort(8080).fetch(request);
	}

	async stop(): Promise<void> {
		await this._rpc.close();
		const container = this.ctx.container;
		if (container?.running) {
			const stopped = container.monitor();
			container.signal(15);
			await stopped;
		}
	}
}

export default {
	async fetch(request: Request, _environment: FixtureWorkerEnv, context: ExecutionContext): Promise<Response> {
		const nodeFirst = new URL(request.url).searchParams.get("nodeFirst") !== "false";
		const stub = context.exports.FixtureContainer.getByName(
			nodeFirst ? "portal-fixture" : "portal-worker-first-fixture",
		);
		if (new URL(request.url).pathname === "/stop") {
			await stub.stop();
			return new Response("stopped");
		}
		if (new URL(request.url).pathname !== "/") return stub.publicFetch(request);
		return Response.json(await stub.run(nodeFirst));
	},
} satisfies ExportedHandler<FixtureWorkerEnv>;
