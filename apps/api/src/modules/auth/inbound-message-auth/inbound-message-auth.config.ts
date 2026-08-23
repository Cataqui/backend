import { registerAs } from "@nestjs/config";
import { InboundMessageAuthChannel } from "./enums/inbound-message-auth-channel.enum";

export interface IInboundMessageAuthConfig {
	codeReceiverByChannel: Record<InboundMessageAuthChannel, string>;
}

export const inboundMessageAuthConfig = registerAs(
	"inboundMessageAuth",
	(): IInboundMessageAuthConfig => ({
		codeReceiverByChannel: {
			[InboundMessageAuthChannel.WHATSAPP]: process.env["WHATSAPP_AUTH_RECEIVER"] as string,
		} satisfies Record<InboundMessageAuthChannel, string>,
	}),
);
