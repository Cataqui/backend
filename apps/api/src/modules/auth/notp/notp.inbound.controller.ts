import { VerifyNotpInputSchema } from "@cataqui/api-internal-ingress";
import { Body } from "@nestjs/common";
import type { z } from "zod";
import { InboundController } from "../../../core/inbound/inbound-controller.decorator";
import { InboundReceiver } from "../../../core/inbound/inbound-receiver.decorator";
import { ObservabilityOperationName } from "../../../core/observability/observability-operation-name.enum";
import { ObservabilityService } from "../../../core/observability/observability.service";
import { NotpChannel } from "./enums/notp-channel.enum";
import { NotpService } from "./notp.service";

@InboundController()
export class NotpInboundController {
	constructor(
		private readonly _notpService: NotpService,
		private readonly _observabilityService: ObservabilityService,
	) {}

	@InboundReceiver("verify-whatsapp-notp")
	async verifyWhatsappNotp(
		@Body({ schema: VerifyNotpInputSchema })
		message: z.infer<typeof VerifyNotpInputSchema>,
	): Promise<void> {
		await this._observabilityService.observeOperation({
			operation: () =>
				this._notpService.verifyNotp({
					channel: NotpChannel.WHATSAPP,
					providerMessageId: message.providerMessageId,
					providerSubject: message.providerSenderId,
					contactIdentifier: message.providerContactIdentifier,
					notpCodeHash: message.notpCodeHash,
				}),
			operationName: ObservabilityOperationName.WHATSAPP_NOTP_VERIFICATION,
		});
	}
}
