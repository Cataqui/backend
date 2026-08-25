import { WhatsappMessagesWebhookValueSchema } from "./whatsapp-messages-webhook-value.schema";

describe("WhatsappMessagesWebhookValueSchema", () => {
	it("should accept a WhatsApp text-message webhook value", () => {
		expect(
			WhatsappMessagesWebhookValueSchema.safeParse({
				messaging_product: "whatsapp",
				metadata: { display_phone_number: "+1 555 0100", phone_number_id: "1234567890" },
				messages: [
					{
						from_user_id: "user.9373795779eb6441c8adb2eaee5b848e7dd174ddd302d7db62142f4722d574b6",
						id: "wamid.message",
						text: { body: "NOTP-K7F9Q2M8VD" },
						timestamp: "1786172400",
						type: "text",
					},
				],
			}).success,
		).toBe(true);
	});

	it("should accept a current WhatsApp message with the from sender identifier", () => {
		expect(
			WhatsappMessagesWebhookValueSchema.safeParse({
				messaging_product: "whatsapp",
				metadata: { display_phone_number: "+1 555 0100", phone_number_id: "1234567890" },
				messages: [
					{
						from: "5511999999999",
						id: "wamid.message",
						text: { body: "NOTP-K7F9Q2M8VD" },
						timestamp: "1786172400",
						type: "text",
					},
				],
			}).success,
		).toBe(true);
	});

	it("should accept WhatsApp username identity fields", () => {
		expect(
			WhatsappMessagesWebhookValueSchema.safeParse({
				messaging_product: "whatsapp",
				metadata: { display_phone_number: "+1 555 0100", phone_number_id: "1234567890" },
				contacts: [
					{
						profile: { name: "Cataqui Poster", username: "@cataqui.poster" },
						user_id: "user.9373795779eb6441c8adb2eaee5b848e7dd174ddd302d7db62142f4722d574b6",
					},
				],
				messages: [
					{
						from_user_id: "user.9373795779eb6441c8adb2eaee5b848e7dd174ddd302d7db62142f4722d574b6",
						id: "wamid.message",
						text: { body: "NOTP-K7F9Q2M8VD" },
						timestamp: "1786172400",
						type: "text",
					},
				],
			}).success,
		).toBe(true);
	});

	it("should accept empty legacy phone fields when a business-scoped user ID identifies the sender", () => {
		expect(
			WhatsappMessagesWebhookValueSchema.safeParse({
				messaging_product: "whatsapp",
				metadata: { display_phone_number: "+1 555 0100", phone_number_id: "1234567890" },
				contacts: [
					{
						profile: { name: "Cataqui Poster", username: "@cataqui.poster" },
						user_id: "user.9373795779eb6441c8adb2eaee5b848e7dd174ddd302d7db62142f4722d574b6",
						wa_id: "",
					},
				],
				messages: [
					{
						from: "",
						from_user_id: "user.9373795779eb6441c8adb2eaee5b848e7dd174ddd302d7db62142f4722d574b6",
						id: "wamid.message",
						text: { body: "NOTP-K7F9Q2M8VD" },
						timestamp: "1786172400",
						type: "text",
					},
				],
			}).success,
		).toBe(true);
	});

	it("should reject a WhatsApp message without either sender identifier", () => {
		expect(
			WhatsappMessagesWebhookValueSchema.safeParse({
				messaging_product: "whatsapp",
				metadata: { display_phone_number: "+1 555 0100", phone_number_id: "1234567890" },
				messages: [
					{
						id: "wamid.message",
						text: { body: "NOTP-K7F9Q2M8VD" },
						timestamp: "1786172400",
						type: "text",
					},
				],
			}).success,
		).toBe(false);
	});

	it("should accept a status-only WhatsApp messages webhook value", () => {
		expect(
			WhatsappMessagesWebhookValueSchema.safeParse({
				messaging_product: "whatsapp",
				metadata: { display_phone_number: "+1 555 0100", phone_number_id: "1234567890" },
				statuses: [{ id: "wamid.message", status: "delivered" }],
			}).success,
		).toBe(true);
	});

	it("should reject a WhatsApp messages webhook value without provider phone-number metadata", () => {
		expect(WhatsappMessagesWebhookValueSchema.safeParse({ messaging_product: "whatsapp", messages: [] }).success).toBe(
			false,
		);
	});
});
