import { VerifyInboundMessageAuthInputSchema } from "./verify-inbound-message-auth-input.schema";

function _createValidInput(): Record<string, unknown> {
	return {
		providerMessageId: "provider-message-id",
		providerSenderId: "provider-sender-id",
		providerContactIdentifier: "+5511999999999",
		authCodeHash: "a".repeat(64),
	};
}

describe("VerifyInboundMessageAuthInputSchema", () => {
	it("should accept a complete normalized inbound authentication message", () => {
		expect(VerifyInboundMessageAuthInputSchema.safeParse(_createValidInput()).success).toBe(true);
	});

	it("should require the provider contact identifier", () => {
		const input = _createValidInput();
		Reflect.deleteProperty(input, "providerContactIdentifier");

		expect(VerifyInboundMessageAuthInputSchema.safeParse(input).success).toBe(false);
	});

	it("should reject a plaintext authentication code", () => {
		expect(
			VerifyInboundMessageAuthInputSchema.safeParse({ ..._createValidInput(), authCodeHash: "AUTH-K7F9Q2M8VD" })
				.success,
		).toBe(false);
	});

	it("should reject undeclared message properties", () => {
		expect(VerifyInboundMessageAuthInputSchema.safeParse({ ..._createValidInput(), text: "secret" }).success).toBe(
			false,
		);
	});
});
