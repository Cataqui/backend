import { RendererProcessClosedError } from "./errors/renderer-process-closed.error";
import { RendererProcessUnavailableError } from "./errors/renderer-process-unavailable.error";
import { InvalidRendererFrameError } from "./errors/invalid-renderer-frame.error";

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import { injectable } from "tsyringe";
import { EngineAssetsService } from "./engine-assets.service";
import type { EngineMapRenderInput } from "./engine-map-render-input.interface";

export type RendererProcessOperation = { op: "ready" } | { op: "render"; map: EngineMapRenderInput };

export interface RendererProcessResponse {
	id: number;
	value: unknown;
}

interface _EngineRequest {
	id: number;
	resolve(value: RendererProcessResponse): void;
	reject(error: unknown): void;
}

interface _EngineProcess {
	child: ChildProcessWithoutNullStreams;
	closed: Promise<void>;
	pending: _EngineRequest | undefined;
	chunks: Buffer[];
	bytes: number;
	failed: boolean;
}

@injectable()
export class RendererProcessRepository {
	constructor(private readonly _assets: EngineAssetsService) {}
	private _process: _EngineProcess | undefined;
	private _nextId = 1;

	get running(): boolean {
		return this._process !== undefined && !this._process.failed;
	}

	async start(): Promise<void> {
		if (this.running) return;
		const previous = this._process;
		if (previous !== undefined) await previous.closed;
		const child = spawn(
			process.env["MAPSHOT_RENDERER_PATH"] ?? fileURLToPath(new URL("./mapshot-renderer", import.meta.url)),
			[],
			{ stdio: "pipe", env: { ...process.env, MAPSHOT_FONT_DIR: this._assets.fontRoot } },
		);
		const closed = Promise.withResolvers<void>();
		const state: _EngineProcess = {
			child: child,
			closed: closed.promise,
			pending: undefined,
			chunks: [],
			bytes: 0,
			failed: false,
		};
		child.on("error", (error) => this._fail({ state: state, error: error }));
		child.stdin.on("error", (error) => this._fail({ state: state, error: error }));
		child.stderr.resume();
		child.stdout.on("data", (chunk: Buffer): void => {
			if (state.failed) return;
			state.chunks.push(chunk);
			state.bytes += chunk.byteLength;
			const end = chunk.indexOf(10);
			if (end === -1) return;
			const pending = state.pending;
			if (pending === undefined || end !== chunk.byteLength - 1) {
				this._fail({
					state: state,
					error: new InvalidRendererFrameError(),
				});
				return;
			}
			try {
				const bytes = Buffer.concat(state.chunks, state.bytes);
				state.chunks = [];
				state.bytes = 0;
				const value: unknown = JSON.parse(
					new TextDecoder("utf8", { fatal: true }).decode(bytes.subarray(0, bytes.byteLength - 1)),
				);
				state.pending = undefined;
				pending.resolve({ id: pending.id, value: value });
			} catch (error) {
				this._fail({ state: state, error: error });
			}
		});
		child.once("close", () => {
			state.failed = true;
			state.pending?.reject(new RendererProcessClosedError());
			state.pending = undefined;
			closed.resolve();
		});
		this._process = state;
	}

	async request(params: {
		operation: RendererProcessOperation;
		signal: AbortSignal;
	}): Promise<RendererProcessResponse> {
		const state = this._process;
		if (state === undefined || state.failed) throw new RendererProcessUnavailableError();
		const id = this._nextId++;
		const body = `${JSON.stringify({ ...params.operation, id: id })}\n`;
		const response = Promise.withResolvers<RendererProcessResponse>();
		state.pending = { id: id, resolve: response.resolve, reject: response.reject };
		const abort = (): void => {
			state.failed = true;
			state.child.kill("SIGKILL");
		};
		params.signal.addEventListener("abort", abort, { once: true });
		try {
			if (params.signal.aborted) abort();
			else
				state.child.stdin.write(body, (error) => {
					if (error !== null && error !== undefined) this._fail({ state: state, error: error });
				});
			return await response.promise;
		} finally {
			params.signal.removeEventListener("abort", abort);
		}
	}

	async close(): Promise<void> {
		const state = this._process;
		if (state === undefined) return;
		state.child.stdin.end();
		const timer = setTimeout(() => state.child.kill("SIGKILL"), 1000);
		try {
			await state.closed;
		} finally {
			clearTimeout(timer);
			if (this._process === state) this._process = undefined;
		}
	}

	async kill(): Promise<void> {
		const state = this._process;
		if (state === undefined) return;
		state.failed = true;
		state.child.kill("SIGKILL");
		await state.closed;
		if (this._process === state) this._process = undefined;
	}

	private _fail(params: { state: _EngineProcess; error: unknown }): void {
		params.state.failed = true;
		params.state.pending?.reject(params.error);
		params.state.pending = undefined;
		params.state.child.kill("SIGKILL");
	}
}
