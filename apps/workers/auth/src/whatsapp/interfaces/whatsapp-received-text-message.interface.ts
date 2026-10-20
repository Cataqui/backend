export interface IWhatsappReceivedTextMessage {
	messageId: string;
	senderId: string;
	contactIdentifier: string | undefined;
	profileName: string | undefined;
	recipientPhoneNumberId: string;
	text: string;
}
