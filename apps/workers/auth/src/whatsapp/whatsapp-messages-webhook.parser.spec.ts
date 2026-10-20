import { getTextMessagesFromWhatsappWebhook } from "./whatsapp-messages-webhook.parser";

function _buildPayload(params?: {
	body?: string;
	contacts?: unknown[];
	messages?: unknown[];
	phoneNumberId?: string;
}): Record<string, unknown> {
	return {
		object: "whatsapp_business_account",
		entry: [
			{
				id: "waba-id",
				changes: [
					{
						field: "messages",
						value: {
							messaging_product: "whatsapp",
							metadata: {
								display_phone_number: "+1 555 0100",
								phone_number_id: params?.phoneNumberId ?? "1234567890",
							},
							contacts: params?.contacts ?? [
								{
									profile: { name: "Cataqui User", username: "cataqui.user" },
									user_id: "user.9373795779eb6441c8adb2eaee5b848e7dd174ddd302d7db62142f4722d574b6",
								},
							],
							messages: params?.messages ?? [
								{
									id: "wamid.message",
									from_user_id: "user.9373795779eb6441c8adb2eaee5b848e7dd174ddd302d7db62142f4722d574b6",
									timestamp: "1786172400",
									type: "text",
									text: { body: params?.body ?? "Olá" },
								},
							],
						},
					},
				],
			},
		],
	};
}

describe("getTextMessagesFromWhatsappWebhook", () => {
	it("should return WhatsApp message and recipient identifiers independently of message purpose", () => {
		const messages = getTextMessagesFromWhatsappWebhook({ requestBody: _buildPayload() });

		expect(messages[0]).toEqual({
			messageId: "wamid.message",
			senderId: "user.9373795779eb6441c8adb2eaee5b848e7dd174ddd302d7db62142f4722d574b6",
			contactIdentifier: "cataqui.user",
			profileName: "Cataqui User",
			recipientPhoneNumberId: "1234567890",
			text: "Olá",
		});
	});

	it("should use the current WhatsApp from field as the sender and phone contact identifier", () => {
		const messages = getTextMessagesFromWhatsappWebhook({
			requestBody: _buildPayload({
				contacts: [],
				messages: [
					{
						from: "5511999999999",
						id: "wamid.message",
						text: { body: "Olá" },
						timestamp: "1786172400",
						type: "text",
					},
				],
			}),
		});

		expect({ sender: messages[0]?.senderId, contact: messages[0]?.contactIdentifier }).toEqual({
			sender: "5511999999999",
			contact: "+5511999999999",
		});
	});

	it("should prefer the WhatsApp business-scoped user ID over the current from field", () => {
		const messages = getTextMessagesFromWhatsappWebhook({
			requestBody: _buildPayload({
				messages: [
					{
						from: "5511999999999",
						from_user_id: "user.preferred",
						id: "wamid.message",
						text: { body: "Olá" },
						timestamp: "1786172400",
						type: "text",
					},
				],
			}),
		});

		expect({ sender: messages[0]?.senderId, contact: messages[0]?.contactIdentifier }).toEqual({
			sender: "user.preferred",
			contact: "+5511999999999",
		});
	});

	it("should preserve a missing optional contact identifier for non-authentication consumers", () => {
		const messages = getTextMessagesFromWhatsappWebhook({ requestBody: _buildPayload({ contacts: [] }) });

		expect(messages[0]?.contactIdentifier).toBeUndefined();
	});

	it("should expose the receiving WhatsApp phone-number ID for use-case routing", () => {
		const messages = getTextMessagesFromWhatsappWebhook({
			requestBody: _buildPayload({ phoneNumberId: "9876543210" }),
		});

		expect(messages[0]?.recipientPhoneNumberId).toBe("9876543210");
	});

	it("should parse every text message from a batched WhatsApp webhook", () => {
		const firstEntry = (_buildPayload({ body: "First" })["entry"] as unknown[])[0];
		const secondEntry = (_buildPayload({ body: "Second" })["entry"] as unknown[])[0];
		const messages = getTextMessagesFromWhatsappWebhook({
			requestBody: {
				object: "whatsapp_business_account",
				entry: [firstEntry, secondEntry],
			},
		});

		expect(messages.map((message) => message.text)).toEqual(["First", "Second"]);
	});

	it("should ignore unsupported WhatsApp message types", () => {
		const messages = getTextMessagesFromWhatsappWebhook({
			requestBody: _buildPayload({
				messages: [
					{
						id: "wamid.message",
						from_user_id: "user.sender",
						timestamp: "1786172400",
						type: "image",
					},
				],
			}),
		});

		expect(messages).toEqual([]);
	});

	it("should ignore text message records without text content", () => {
		const messages = getTextMessagesFromWhatsappWebhook({
			requestBody: _buildPayload({
				messages: [
					{
						id: "wamid.message",
						from_user_id: "user.sender",
						timestamp: "1786172400",
						type: "text",
					},
				],
			}),
		});

		expect(messages).toEqual([]);
	});

	it("should ignore webhook changes unrelated to WhatsApp messages", () => {
		const messages = getTextMessagesFromWhatsappWebhook({
			requestBody: {
				object: "whatsapp_business_account",
				entry: [{ id: "waba-id", changes: [{ field: "account_update", value: {} }] }],
			},
		});

		expect(messages).toEqual([]);
	});

	it("should reject a messages change whose provider-owned value is malformed", () => {
		expect(() =>
			getTextMessagesFromWhatsappWebhook({
				requestBody: {
					object: "whatsapp_business_account",
					entry: [{ id: "waba-id", changes: [{ field: "messages", value: {} }] }],
				},
			}),
		).toThrow("Authenticated WhatsApp webhook payload is invalid");
	});
});
