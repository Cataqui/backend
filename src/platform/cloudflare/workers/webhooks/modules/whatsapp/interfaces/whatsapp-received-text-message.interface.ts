export interface IWhatsappReceivedTextMessage {
	providerMessageId: string;
	providerSenderId: string;
	providerContactIdentifier: string | undefined;
	recipientPhoneNumberId: string;
	text: string;
}
