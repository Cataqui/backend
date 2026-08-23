import { z } from "zod";
import { InboundMessageAuthChannel } from "../enums/inbound-message-auth-channel.enum";

export const CreateInboundMessageAuthIntentInputSchema = z
	.object({
		channel: z.enum(InboundMessageAuthChannel, {
			error: `channel must be a supported inbound-message authentication channel (${Object.values(InboundMessageAuthChannel).join(", ")}). Example: WHATSAPP`,
		}),
	})
	.strict()
	.meta({ id: "CreateInboundMessageAuthIntentInput" });
