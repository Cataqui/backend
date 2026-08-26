import { NotpIntentPendingOutputSchema } from "./notp-intent-pending-output.schema";

describe("NotpIntentPendingOutputSchema", () => {
	it("should expose the pending intent status and polling delay", () => {
		expect(NotpIntentPendingOutputSchema.parse({ status: "PENDING", retryAfterSeconds: 2 })).toEqual({
			status: "PENDING",
			retryAfterSeconds: 2,
		});
	});
});
