export class DurableObject<Environment> {
	constructor(
		readonly ctx: DurableObjectState,
		readonly env: Environment,
	) {}
}
export class WorkerEntrypoint<Environment> {
	constructor(
		readonly ctx: ExecutionContext,
		readonly env: Environment,
	) {}
}
