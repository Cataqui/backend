export class DurableObject<Env> {
	constructor(
		protected readonly ctx: unknown,
		protected readonly env: Env,
	) {}
}

export class WorkerEntrypoint<Env> {
	constructor(
		protected readonly ctx: unknown,
		protected readonly env: Env,
	) {}
}
