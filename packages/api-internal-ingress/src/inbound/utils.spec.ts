import { getInboundCallUrl } from "./utils";

describe("getInboundCallUrl", () => {
	it("should return the complete localhost URL for an inbound receiver", () => {
		expect(getInboundCallUrl({ receiver: "verify-whatsapp-notp" })).toBe(
			"http://localhost/internal/inbound/verify-whatsapp-notp",
		);
	});
});
