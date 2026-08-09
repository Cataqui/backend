import { z } from "zod";

export const WhatsappMessagesWebhookValueSchema = z.looseObject({
	messaging_product: z.literal("whatsapp"),
	metadata: z.looseObject({
		display_phone_number: z.string(),
		phone_number_id: z.string(),
	}),
	contacts: z
		.array(
			z.looseObject({
				profile: z.looseObject({ name: z.string(), username: z.string().min(1).optional() }),
				user_id: z.string().min(1).optional(),
				wa_id: z.string().optional(),
			}),
		)
		.optional(),
	messages: z
		.array(
			z
				.looseObject({
					from: z.string().optional(),
					from_user_id: z.string().min(1).optional(),
					id: z.string(),
					text: z.object({ body: z.string() }).optional(),
					timestamp: z.string(),
					type: z.string(),
				})
				.refine((message) => message.from_user_id !== undefined || Boolean(message.from), {
					message: "WhatsApp message must include from or from_user_id as a non-empty sender identifier",
				}),
		)
		.optional(),
	statuses: z.array(z.unknown()).optional(),
});
