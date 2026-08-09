import { InboundMessageAuthQueueMessageSchema } from "@/platform/cloudflare/queues/schemas/inbound-message-auth-queue-message.schema";
import { Body } from "@nestjs/common";
import type { z } from "zod";
import { QueueConsumer } from "../../../core/queue/queue-consumer.decorator";
import { QueueController } from "../../../core/queue/queue-controller.decorator";
import { InboundMessageAuthChannel } from "./enums/inbound-message-auth-channel.enum";
import { InboundMessageAuthService } from "./inbound-message-auth.service";

@QueueController()
export class InboundMessageAuthQueueController {
	constructor(private readonly _inboundMessageAuthService: InboundMessageAuthService) {}

	@QueueConsumer("cataqui-api-verify-whatsapp-auth-message")
	async verifyWhatsappAuthMessage(
		@Body({ schema: InboundMessageAuthQueueMessageSchema })
		message: z.infer<typeof InboundMessageAuthQueueMessageSchema>,
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
