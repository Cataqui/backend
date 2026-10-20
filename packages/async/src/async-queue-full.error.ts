export class AsyncQueueFullError extends Error {
	constructor() {
		super("Async queue is full");
		this.name = "AsyncQueueFullError";
	}
}
