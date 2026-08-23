import { z } from "zod";

export const WhatsappMessagesWebhookSchema = z.looseObject({
	object: z.literal("whatsapp_business_account"),
	entry: z.array(
		z.looseObject({
			id: z.string(),
			changes: z.array(
				z.looseObject({
					field: z.string(),
					value: z.unknown(),
				}),
			),
		}),
	),
});
