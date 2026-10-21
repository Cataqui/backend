import { RpcTarget } from "capnweb";
import type { CallContext } from "./types";

export interface Failure {
	name: string;
	message: string;
	errorCode: string | undefined;
}

export type Outcome = { ok: true; value: unknown } | { ok: false; error: Failure };

export interface Invocation {
	method: string;
	args: unknown[];
}

export class Call extends RpcTarget {
	private readonly _controller = new AbortController();
	private readonly _result: Promise<Outcome>;
	private _release: (() => void) | undefined;

	constructor(params: { api: object; invocation: Invocation; release?: (() => void) | undefined }) {
		super();
		this._release = params.release;
		this._result = Promise.resolve().then(async (): Promise<Outcome> => {
			try {
				this._controller.signal.throwIfAborted();
				const { method, args } = params.invocation;
				const operation: unknown = Object.hasOwn(params.api, method) ? Reflect.get(params.api, method) : undefined;
				if (typeof operation !== "function") throw new TypeError(`Portal method ${method} is not exposed.`);
				const context: CallContext = { signal: this._controller.signal };
				const value: unknown = await Reflect.apply(operation, params.api, [...args, context]);
				return { ok: true, value: this.#_withCancellation(value) };
			} catch (error) {
				return {
					ok: false,
					error: {
						name: error instanceof Error ? error.name : "Error",
						message: error instanceof Error ? error.message : "Portal operation threw a non-Error value.",
						errorCode:
							error instanceof Error && "errorCode" in error && typeof error.errorCode === "string"
								? error.errorCode
								: undefined,
					},
				};
			}
		});
	}

	result(): Promise<Outcome> {
		return this._result;
	}

	cancel(): void {
		this._controller.abort();
		this._release?.();
		this._release = undefined;
	}

	[Symbol.dispose](): void {
		this.cancel();
	}

	#_withCancellation(value: unknown): unknown {
		if (value instanceof ReadableStream)
			return value.pipeThrough(new TransformStream(), { signal: this._controller.signal });
		if (Array.isArray(value)) return value.map((item) => this.#_withCancellation(item));
		if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype)
			return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, this.#_withCancellation(item)]));
		return value;
	}
}

export class Dispatcher extends RpcTarget {
	private readonly _api: object;
	private readonly _acquire: (() => () => void) | undefined;

	constructor(params: { api: object; acquire?: (() => () => void) | undefined }) {
		super();
		for (const method of ["close", "withOptions", "then"]) {
			if (Object.hasOwn(params.api, method)) throw new TypeError(`Portal method ${method} is reserved by the channel.`);
		}
		this._api = params.api;
		this._acquire = params.acquire;
	}

	start(invocation: Invocation): Call {
		return new Call({ api: this._api, invocation: invocation, release: this._acquire?.() });
	}
}
