import { InboundMessageAuthQueueMessageSchema } from "./inbound-message-auth-queue-message.schema";

function _createValidQueueMessage() {
	return {
		providerMessageId: "wamid.message",
		providerSenderId: "user.9373795779eb6441c8adb2eaee5b848e7dd174ddd302d7db62142f4722d574b6",
		providerContactIdentifier: "+5511999999999",
		authCodeHash: "a".repeat(64),
	};
}

describe("InboundMessageAuthQueueMessageSchema", () => {
	it("should accept a normalized authentication-code message", () => {
		expect(InboundMessageAuthQueueMessageSchema.safeParse(_createValidQueueMessage()).success).toBe(true);
	});

	it("should require the provider contact identifier", () => {
		const { providerContactIdentifier: _providerContactIdentifier, ...messageWithoutContact } =
			_createValidQueueMessage();

		expect(InboundMessageAuthQueueMessageSchema.safeParse(messageWithoutContact).success).toBe(false);
	});

	it("should reject an empty provider contact identifier", () => {
		expect(
			InboundMessageAuthQueueMessageSchema.safeParse({
				..._createValidQueueMessage(),
				providerContactIdentifier: "",
			}).success,
		).toBe(false);
	});

	it("should reject a message without an extracted authentication-code hash", () => {
		const { authCodeHash: _authCodeHash, ...messageWithoutCodeHash } = _createValidQueueMessage();

		expect(InboundMessageAuthQueueMessageSchema.safeParse(messageWithoutCodeHash).success).toBe(false);
	});

	it("should reject plaintext authentication codes", () => {
		expect(
			InboundMessageAuthQueueMessageSchema.safeParse({
				..._createValidQueueMessage(),
				code: "AUTH-K7F9Q2M8VD",
			}).success,
		).toBe(false);
	});

	it("should reject a code hash that is not lowercase SHA-256 hex", () => {
		expect(
			InboundMessageAuthQueueMessageSchema.safeParse({
				..._createValidQueueMessage(),
				authCodeHash: "invalid",
			}).success,
		).toBe(false);
	});
});
