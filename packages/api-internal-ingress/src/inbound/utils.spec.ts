import { getInboundCallUrl } from "./utils";

describe("getInboundCallUrl", () => {
	it("should return the complete localhost URL for an inbound receiver", () => {
		expect(getInboundCallUrl({ receiver: "verify-whatsapp-auth-message" })).toBe(
			"http://localhost/internal/inbound/verify-whatsapp-auth-message",
		);
	});
});
