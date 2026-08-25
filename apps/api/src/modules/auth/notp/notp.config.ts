import { registerAs } from "@nestjs/config";
import { NotpChannel } from "./enums/notp-channel.enum";

export interface INotpConfig {
	codeReceiverByChannel: Record<NotpChannel, string>;
}

export const notpConfig = registerAs(
	"notp",
	(): INotpConfig => ({
		codeReceiverByChannel: {
			[NotpChannel.WHATSAPP]: process.env["WHATSAPP_NOTP_RECEIVER"] as string,
		} satisfies Record<NotpChannel, string>,
	}),
);
