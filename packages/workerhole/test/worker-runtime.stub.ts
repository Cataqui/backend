export class WorkerEntrypoint<Environment, Props = object> {
	protected readonly env: Environment;
	protected readonly ctx: { props?: Props };
	constructor(_context: unknown, environment: Environment) {
		this.env = environment;
		this.ctx = _context as { props?: Props };
	}
}
