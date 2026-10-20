import type { Adapter } from "./adapter.types";
import { ConnectionClosedError } from "./errors";
import { OutgoingCall } from "./outgoing-call";
import type { CallOptions, Channel } from "./types";

export function createChannel<RemoteApi extends object>(params: { adapter: Adapter }): Channel<RemoteApi> {
	const closed = new AbortController();
	let closing: Promise<void> | undefined;
	const close = (): Promise<void> => {
		if (closing !== undefined) return closing;
		// Share cleanup before cancellation can trigger another close.
		closing = Promise.resolve().then(() => params.adapter.close());
		closed.abort(new ConnectionClosedError());
		return closing;
	};
	const createView = (options: CallOptions): Channel<RemoteApi> => {
		if (options.timeoutMs !== undefined && (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 0))
			throw new RangeError("Portal timeoutMs must be a finite nonnegative number.");
		return new Proxy(
			{},
			{
				get(_target, method) {
					if (method === "close") return close;
					if (method === "withOptions")
						return (overrides: CallOptions): Channel<RemoteApi> => createView({ ...options, ...overrides });
					if (typeof method !== "string" || method === "then") return undefined;
					return async (...args: unknown[]): Promise<unknown> =>
						new OutgoingCall({ adapter: params.adapter, options: options, closed: closed.signal }).invoke({
							method: method,
							args: args,
						});
				},
			},
		) as Channel<RemoteApi>;
	};
	return createView({});
}
