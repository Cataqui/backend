import { InboundMessageAuthProcessingInProgressError } from "./inbound-message-auth-processing-in-progress.error";

describe("InboundMessageAuthProcessingInProgressError", () => {
	it("should explain that Queue delivery must retry the in-progress message", () => {
		const error = new InboundMessageAuthProcessingInProgressError();

		expect(error.message).toBe(
			"The inbound-message authentication message is still processing and must be retried after recovery",
		);
	});
});
