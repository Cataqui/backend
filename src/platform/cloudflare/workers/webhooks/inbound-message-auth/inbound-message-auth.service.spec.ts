import fc from "fast-check";
import { InboundMessageAuthService } from "./inbound-message-auth.service";

const service = new InboundMessageAuthService();

function getInboundMessageAuthInputOrNull(params: Parameters<InboundMessageAuthService["getInputOrNull"]>[0]) {
	return service.getInputOrNull(params);
}

function _createMessage(params?: { text?: string; providerContactIdentifier?: string | undefined }) {
	return {
		providerMessageId: "provider-message-id",
		providerSenderId: "provider-sender-id",
		providerContactIdentifier:
			params !== undefined && "providerContactIdentifier" in params
				? params.providerContactIdentifier
				: "+5511999999999",
		text: params?.text ?? "AUTH-K7F9Q2M8VD",
	};
}

describe("getInboundMessageAuthInputOrNull", () => {
	const originalToHex = Object.getOwnPropertyDescriptor(Uint8Array.prototype, "toHex");

	beforeAll(() => {
		Object.defineProperty(Uint8Array.prototype, "toHex", {
			configurable: true,
			value: vi.fn().mockReturnValue("a".repeat(64)),
		});
	});

	afterAll(() => {
		if (originalToHex === undefined) {
			Reflect.deleteProperty(Uint8Array.prototype, "toHex");
			return;
		}

		Object.defineProperty(Uint8Array.prototype, "toHex", originalToHex);
	});

	it("should build normalized authentication input from one case-insensitive authentication code", async () => {
		const result = await getInboundMessageAuthInputOrNull(_createMessage({ text: "Meu código é auth-k7f9q2m8vd." }));

		expect(result).toEqual({
			providerMessageId: "provider-message-id",
			providerSenderId: "provider-sender-id",
			providerContactIdentifier: "+5511999999999",
			authCodeHash: "a".repeat(64),
		});
	});

	it("should ignore text without an authentication code", async () => {
		const result = await getInboundMessageAuthInputOrNull(_createMessage({ text: "Olá" }));

		expect(result).toBeNull();
	});

	it("should ignore text containing more than one authentication code", async () => {
		const result = await getInboundMessageAuthInputOrNull(_createMessage({ text: "AUTH-K7F9Q2M8VD AUTH-AAAAAAAAAA" }));

		expect(result).toBeNull();
	});

	it("should ignore malformed authentication-like text", async () => {
		const result = await getInboundMessageAuthInputOrNull(_createMessage({ text: "AUTH-INVALID" }));

		expect(result).toBeNull();
	});

	it("should require a contact identifier only after identifying an authentication code", async () => {
		await expect(
			getInboundMessageAuthInputOrNull(_createMessage({ providerContactIdentifier: undefined })),
		).rejects.toThrow("Inbound-message authentication requires a provider contact identifier");
	});

	it("should accept every ten-character uppercase alphanumeric authentication-code suffix", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.string({
					unit: fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"),
					minLength: 10,
					maxLength: 10,
				}),
				async (suffix) => (await getInboundMessageAuthInputOrNull(_createMessage({ text: `AUTH-${suffix}` }))) !== null,
			),
		);
	});
});
