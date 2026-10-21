import { InvalidWhatsappWebhookError } from "./errors/invalid-whatsapp-webhook.error";
import type { IWhatsappReceivedTextMessage } from "./interfaces/whatsapp-received-text-message.interface";
import { WhatsappMessagesWebhookValueSchema } from "./schemas/whatsapp-messages-webhook-value.schema";
import { WhatsappMessagesWebhookSchema } from "./schemas/whatsapp-messages-webhook.schema";

export function getTextMessagesFromWhatsappWebhook(params: { requestBody: unknown }): IWhatsappReceivedTextMessage[] {
	const parsedWebhook = WhatsappMessagesWebhookSchema.safeParse(params.requestBody);
	if (!parsedWebhook.success) throw new InvalidWhatsappWebhookError();

	return parsedWebhook.data.entry.flatMap((entry) =>
		entry.changes.flatMap((change) => {
			if (change.field !== "messages") return [];

			const parsedChange = WhatsappMessagesWebhookValueSchema.safeParse(change.value);
			if (!parsedChange.success) throw new InvalidWhatsappWebhookError();

			return (parsedChange.data.messages ?? []).flatMap((message) => {
				if (message.type !== "text" || message.text === undefined) return [];

				const senderId = message.from_user_id ?? message.from;
				if (senderId === undefined) throw new InvalidWhatsappWebhookError();

				const senderContact = parsedChange.data.contacts?.find(
					(contact) =>
						(contact.user_id !== undefined && contact.user_id === message.from_user_id) ||
						(Boolean(contact.wa_id) && contact.wa_id === message.from),
				);
				const phoneNumber = (message.from || undefined) ?? (senderContact?.wa_id || undefined);
				const contactIdentifier =
					phoneNumber === undefined
						? senderContact?.profile.username
						: phoneNumber.startsWith("+")
							? phoneNumber
							: `+${phoneNumber}`;

				return [
					{
						messageId: message.id,
						senderId: senderId,
						contactIdentifier: contactIdentifier,
						profileName: senderContact?.profile.name,
						recipientPhoneNumberId: parsedChange.data.metadata.phone_number_id,
						text: message.text.body,
					},
				];
			});
		}),
	);
}
