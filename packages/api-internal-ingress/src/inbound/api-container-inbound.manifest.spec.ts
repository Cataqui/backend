import { VerifyNotpInputSchema } from "./schemas/verify-notp-input.schema";
import { apiContainerInboundManifest, inboundReceiverPathPrefix } from "./api-container-inbound.manifest";

describe("API container inbound manifest", () => {
	it("should keep every receiver beneath the internal inbound path", () => {
		expect(inboundReceiverPathPrefix).toBe("internal/inbound");
	});

	it("should make the normalized WhatsApp NOTP schema authoritative for its receiver", () => {
		expect(apiContainerInboundManifest["verify-whatsapp-notp"].bodySchema).toBe(VerifyNotpInputSchema);
	});
});
