import { InboundMessageAuthChannel } from "./enums/inbound-message-auth-channel.enum";
import { inboundMessageAuthConfig } from "./inbound-message-auth.config";

describe("inboundMessageAuthConfig", () => {
	it("should map every inbound-message authentication channel to its code receiver", () => {
		vi.stubEnv("WHATSAPP_AUTH_RECEIVER", "+5511963270517");

		expect(inboundMessageAuthConfig()).toEqual({
			codeReceiverByChannel: {
				[InboundMessageAuthChannel.WHATSAPP]: "+5511963270517",
			},
		});
	});
});
