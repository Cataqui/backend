import type { IWhatsappReceivedTextMessage } from "./interfaces/whatsapp-received-text-message.interface";
import { WhatsappMessagesWebhookValueSchema } from "./schemas/whatsapp-messages-webhook-value.schema";
import { WhatsappMessagesWebhookSchema } from "./schemas/whatsapp-messages-webhook.schema";

export function getTextMessagesFromWhatsappWebhook(params: { requestBody: unknown }): IWhatsappReceivedTextMessage[] {
	const parsedWebhook = WhatsappMessagesWebhookSchema.safeParse(params.requestBody);
	if (!parsedWebhook.success) throw new Error("Authenticated WhatsApp webhook payload is invalid");

	return parsedWebhook.data.entry.flatMap((entry) =>
		entry.changes.flatMap((change) => {
			if (change.field !== "messages") return [];

			const parsedChange = WhatsappMessagesWebhookValueSchema.safeParse(change.value);
			if (!parsedChange.success) throw new Error("Authenticated WhatsApp webhook payload is invalid");

			return (parsedChange.data.messages ?? []).flatMap((message) => {
				if (message.type !== "text" || message.text === undefined) return [];

				const providerSenderId = message.from_user_id ?? message.from;
				if (providerSenderId === undefined) throw new Error("Authenticated WhatsApp webhook payload is invalid");

				const senderContact = parsedChange.data.contacts?.find(
					(contact) =>
						(contact.user_id !== undefined && contact.user_id === message.from_user_id) ||
						(Boolean(contact.wa_id) && contact.wa_id === message.from),
				);
				const phoneNumber = (message.from || undefined) ?? (senderContact?.wa_id || undefined);
				const providerContactIdentifier =
					phoneNumber === undefined
						? senderContact?.profile.username
						: phoneNumber.startsWith("+")
							? phoneNumber
							: `+${phoneNumber}`;

				return [
					{
						providerMessageId: message.id,
						providerSenderId: providerSenderId,
						providerContactIdentifier: providerContactIdentifier,
						recipientPhoneNumberId: parsedChange.data.metadata.phone_number_id,
						text: message.text.body,
					},
				];
			});
		}),
	);
}
