import { VerifyNotpInputSchema } from "@cataqui/api-internal-ingress";
import { Body } from "@nestjs/common";
import type { z } from "zod";
import { InboundController } from "../../../core/inbound/inbound-controller.decorator";
import { InboundReceiver } from "../../../core/inbound/inbound-receiver.decorator";
import { NotpChannel } from "./enums/notp-channel.enum";
import { NotpService } from "./notp.service";

@InboundController()
export class NotpInboundController {
	constructor(private readonly _notpService: NotpService) {}

	@InboundReceiver("verify-whatsapp-notp")
	async verifyWhatsappNotp(
		@Body({ schema: VerifyNotpInputSchema })
		message: z.infer<typeof VerifyNotpInputSchema>,
	): Promise<void> {
		await this._notpService.verifyNotp({
			channel: NotpChannel.WHATSAPP,
			providerMessageId: message.providerMessageId,
			providerSubject: message.providerSenderId,
			contactIdentifier: message.providerContactIdentifier,
			providerProfileName: message.providerProfileName,
			notpCodeHash: message.notpCodeHash,
		});
	}
}
