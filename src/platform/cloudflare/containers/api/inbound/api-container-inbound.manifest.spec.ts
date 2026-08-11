import { DeriveJobDataInputSchema } from "./schemas/derive-job-data-input.schema";
import { VerifyInboundMessageAuthInputSchema } from "./schemas/verify-inbound-message-auth-input.schema";
import { apiContainerInboundManifest, inboundReceiverPathPrefix } from "./api-container-inbound.manifest";

describe("API container inbound manifest", () => {
	it("should keep every receiver beneath the internal inbound path", () => {
		expect(inboundReceiverPathPrefix).toBe("internal/inbound");
	});

	it("should make the normalized WhatsApp authentication schema authoritative for its receiver", () => {
		expect(apiContainerInboundManifest["verify-whatsapp-auth-message"].bodySchema).toBe(
			VerifyInboundMessageAuthInputSchema,
		);
	});

	it("should make the job data derivation schema authoritative for its receiver", () => {
		expect(apiContainerInboundManifest["derive-job-data"].bodySchema).toBe(DeriveJobDataInputSchema);
	});
});
