import { AuthIntentPendingOutputSchema } from "./auth-intent-pending-output.schema";

describe("AuthIntentPendingOutputSchema", () => {
	it("should expose the pending intent status and polling delay", () => {
		expect(AuthIntentPendingOutputSchema.parse({ status: "PENDING", retryAfterSeconds: 2 })).toEqual({
			status: "PENDING",
			retryAfterSeconds: 2,
		});
	});
});
