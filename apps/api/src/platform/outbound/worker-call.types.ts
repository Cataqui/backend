import type { z } from "zod";

export type WorkerCallRegistry = Record<
	string,
	{
		host: string;
		methods: Record<string, { input: z.ZodType; result: z.ZodType }>;
	}
>;

export type WorkerCallParameters<Registry extends WorkerCallRegistry> = {
	[Worker in keyof Registry]: {
		[Method in keyof Registry[Worker]["methods"]]: {
			worker: Worker;
			method: Method;
			input: z.input<Registry[Worker]["methods"][Method]["input"]>;
			signal?: AbortSignal;
		};
	}[keyof Registry[Worker]["methods"]];
}[keyof Registry];

export type WorkerCallInput<
	Registry extends WorkerCallRegistry,
	Worker extends keyof Registry,
	Method extends keyof Registry[Worker]["methods"],
> = z.input<Registry[Worker]["methods"][Method]["input"]>;
export type WorkerCallResult<
	Registry extends WorkerCallRegistry,
	Worker extends keyof Registry,
	Method extends keyof Registry[Worker]["methods"],
> = z.output<Registry[Worker]["methods"][Method]["result"]>;
