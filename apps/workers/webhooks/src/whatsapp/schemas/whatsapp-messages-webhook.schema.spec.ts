import { WhatsappMessagesWebhookSchema } from "./whatsapp-messages-webhook.schema";

describe("WhatsappMessagesWebhookSchema", () => {
	it("should accept Meta's WhatsApp business account batch envelope", () => {
		expect(
			WhatsappMessagesWebhookSchema.safeParse({
				object: "whatsapp_business_account",
				entry: [{ id: "waba-id", changes: [{ field: "messages", value: {} }] }],
			}).success,
		).toBe(true);
	});

	it("should preserve additional provider-owned webhook fields", () => {
		const parsedWebhook = WhatsappMessagesWebhookSchema.parse({
			object: "whatsapp_business_account",
			entry: [{ id: "waba-id", changes: [], provider_entry_field: "kept" }],
			provider_root_field: "kept",
		});

		expect(parsedWebhook["provider_root_field"]).toBe("kept");
	});

	it("should reject webhook batches for another Meta object", () => {
		expect(WhatsappMessagesWebhookSchema.safeParse({ object: "page", entry: [] }).success).toBe(false);
	});
});
