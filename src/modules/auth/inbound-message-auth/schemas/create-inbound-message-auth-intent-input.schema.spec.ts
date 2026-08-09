import { InboundMessageAuthChannel } from "../enums/inbound-message-auth-channel.enum";
import { CreateInboundMessageAuthIntentInputSchema } from "./create-inbound-message-auth-intent-input.schema";

describe("CreateInboundMessageAuthIntentInputSchema", () => {
	it("should accept a supported inbound-message authentication channel", () => {
		expect(CreateInboundMessageAuthIntentInputSchema.parse({ channel: "WHATSAPP" }).channel).toBe(
			InboundMessageAuthChannel.WHATSAPP,
		);
	});

	it("should reject an unsupported inbound-message authentication channel", () => {
		expect(CreateInboundMessageAuthIntentInputSchema.safeParse({ channel: "EMAIL" }).success).toBe(false);
	});
});
