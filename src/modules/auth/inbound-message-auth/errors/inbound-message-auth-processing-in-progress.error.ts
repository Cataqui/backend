export class InboundMessageAuthProcessingInProgressError extends Error {
	constructor() {
		super("The inbound-message authentication message is still processing and must be retried after recovery");
	}
}
