export class NotpProcessingInProgressError extends Error {
	constructor() {
		super("The NOTP message is still processing and must be retried after recovery");
	}
}
