import type { CallContext } from "./types";

export type Contract<Api extends object> = {
	[Method in keyof Api]: Method extends "close" | "withOptions" | "then"
		? never
		: Api[Method] extends (...args: infer Arguments) => unknown
			? Arguments extends [...unknown[], infer Context]
				? [Context] extends [CallContext]
					? CallContext extends Context
						? Api[Method]
						: never
					: never
				: never
			: never;
};

export interface ConnectToWorkerOptions {
	expose: { readonly expose: object };
	idleTimeoutMs?: number | undefined;
}

export interface ConnectToContainerOptions {
	context: {
		readonly exports: object;
		blockConcurrencyWhile<Result>(callback: () => Promise<Result>): Promise<Result>;
		readonly container?: object | undefined;
	};
	expose: {
		readonly name: string;
		new (...args: never[]): { readonly expose: object };
	};
	idleTimeoutMs?: number | undefined;
}
