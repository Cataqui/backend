export class WorkerEntrypoint<Environment> {
	constructor(
		readonly ctx: ExecutionContext,
		readonly env: Environment,
	) {}
}
