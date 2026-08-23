import { VerifyInboundMessageAuthInputSchema } from "@cataqui/api-internal-ingress";
import { Body } from "@nestjs/common";
import type { z } from "zod";
import { InboundController } from "../../../core/inbound/inbound-controller.decorator";
import { InboundReceiver } from "../../../core/inbound/inbound-receiver.decorator";
import { InboundMessageAuthChannel } from "./enums/inbound-message-auth-channel.enum";
import { InboundMessageAuthService } from "./inbound-message-auth.service";

@InboundController()
export class InboundMessageAuthInboundController {
	constructor(private readonly _inboundMessageAuthService: InboundMessageAuthService) {}

	@InboundReceiver("verify-whatsapp-auth-message")
	async verifyWhatsappAuthMessage(
		@Body({ schema: VerifyInboundMessageAuthInputSchema })
		message: z.infer<typeof VerifyInboundMessageAuthInputSchema>,
	): Promise<void> {
		await this._inboundMessageAuthService.verifyAuthMessage({
			channel: InboundMessageAuthChannel.WHATSAPP,
			providerMessageId: message.providerMessageId,
			providerSubject: message.providerSenderId,
			contactIdentifier: message.providerContactIdentifier,
			authCodeHash: message.authCodeHash,
		});
	}
}
