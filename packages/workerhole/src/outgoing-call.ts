import type { RpcStub } from "capnweb";
import type { Adapter } from "./adapter.types";
import type { Call, Invocation, Outcome } from "./dispatcher";
import { RemoteError } from "./errors";
import { Result } from "./result";
import type { CallOptions } from "./types";

export class OutgoingCall {
	private readonly _adapter: Adapter;
	private readonly _signal: AbortSignal;
	private _call: RpcStub<Call> | undefined;
	private _outcome: Outcome | undefined;
	private _release: (() => void) | undefined;
	private _finished = false;

	constructor(params: { adapter: Adapter; options: CallOptions; closed: AbortSignal }) {
		this._adapter = params.adapter;
		const signals = [params.closed];
		if (params.options.signal !== undefined) signals.push(params.options.signal);
		if (params.options.timeoutMs !== undefined) signals.push(AbortSignal.timeout(params.options.timeoutMs));
		this._signal = AbortSignal.any(signals);
	}

	async invoke(invocation: Invocation): Promise<unknown> {
		this._signal.throwIfAborted();
		const session = await this._wait(this._adapter.connect());
		this._signal.throwIfAborted();
		this._release = session.acquire?.();
		try {
			this._call = await this._wait(session.remote.start(invocation), (call) => call[Symbol.dispose]());
			this._signal.addEventListener("abort", this._cancel, { once: true });
			if (this._signal.aborted) this._cancel();
			this._outcome = await this._wait<Outcome>(this._call.result(), _dispose);
			this._signal.throwIfAborted();
			if (!this._outcome.ok) throw new RemoteError(this._outcome.error);
			return new Result({ value: this._outcome.value, release: this._finish }).value;
		} catch (error) {
			this._finish();
			throw error;
		}
	}

	private readonly _cancel = (): void => {
		void this._call?.cancel().catch(() => undefined);
	};

	private readonly _finish = (): void => {
		if (this._finished) return;
		this._finished = true;
		this._signal.removeEventListener("abort", this._cancel);
		if (this._outcome !== undefined) _dispose(this._outcome);
		this._cancel();
		this._call?.[Symbol.dispose]();
		this._release?.();
	};

	private _wait<Value>(operation: PromiseLike<Value>, disposeLate?: (value: Value) => void): Promise<Value> {
		return new Promise<Value>((resolve, reject) => {
			let settled = false;
			const abort = (): void => {
				if (settled) return;
				settled = true;
				this._signal.removeEventListener("abort", abort);
				reject(this._signal.reason);
			};
			this._signal.addEventListener("abort", abort, { once: true });
			if (this._signal.aborted) abort();
			void Promise.resolve(operation).then(
				(value) => {
					if (settled) {
						disposeLate?.(value);
						return;
					}
					settled = true;
					this._signal.removeEventListener("abort", abort);
					resolve(value);
				},
				(error: unknown) => {
					settled = true;
					this._signal.removeEventListener("abort", abort);
					reject(error);
				},
			);
		});
	}
}

function _dispose(value: object): void {
	const dispose: unknown = Reflect.get(value, Symbol.dispose);
	if (typeof dispose === "function") Reflect.apply(dispose, value, []);
}
