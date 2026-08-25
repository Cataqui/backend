import { NotpProcessingInProgressError } from "./notp-processing-in-progress.error";

describe("NotpProcessingInProgressError", () => {
	it("should explain that Queue delivery must retry the in-progress message", () => {
		const error = new NotpProcessingInProgressError();

		expect(error.message).toBe("The NOTP message is still processing and must be retried after recovery");
	});
});
