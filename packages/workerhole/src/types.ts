export interface CallContext {
	readonly signal: AbortSignal;
}

export interface CallOptions {
	signal?: AbortSignal | undefined;
	timeoutMs?: number | undefined;
}

type _Arguments<Arguments extends unknown[]> = Arguments extends [...infer Input, CallContext] ? Input : Arguments;

export type Client<Api extends object> = {
	[Method in keyof Api]: Api[Method] extends (...args: infer Arguments) => infer Result
		? (...args: _Arguments<Arguments>) => Promise<Awaited<Result>>
		: never;
};

export type Channel<Api extends object> = Client<Api> & {
	[Method in Extract<keyof Api, "close" | "withOptions" | "then">]: never;
} & {
	withOptions(options: CallOptions): Channel<Api>;
	close(): Promise<void>;
};
