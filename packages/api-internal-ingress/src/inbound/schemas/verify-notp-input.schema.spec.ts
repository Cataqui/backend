import { VerifyNotpInputSchema } from "./verify-notp-input.schema";

function _createValidInput(): Record<string, unknown> {
	return {
		providerMessageId: "provider-message-id",
		providerSenderId: "provider-sender-id",
		providerContactIdentifier: "+5511999999999",
		notpCodeHash: "a".repeat(64),
	};
}

describe("VerifyNotpInputSchema", () => {
	it("should accept a complete normalized inbound NOTP message", () => {
		expect(VerifyNotpInputSchema.safeParse(_createValidInput()).success).toBe(true);
	});

	it("should require the provider contact identifier", () => {
		const input = _createValidInput();
		Reflect.deleteProperty(input, "providerContactIdentifier");

		expect(VerifyNotpInputSchema.safeParse(input).success).toBe(false);
	});

	it("should reject a plaintext NOTP code", () => {
		expect(VerifyNotpInputSchema.safeParse({ ..._createValidInput(), notpCodeHash: "NOTP-K7F9Q2M8VD" }).success).toBe(
			false,
		);
	});

	it("should reject undeclared message properties", () => {
		expect(VerifyNotpInputSchema.safeParse({ ..._createValidInput(), text: "secret" }).success).toBe(false);
	});
});
