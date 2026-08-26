import fc from "fast-check";
import { NotpService } from "./notp.service";

const service = new NotpService();

function getNotpInputOrNull(params: Parameters<NotpService["getInputOrNull"]>[0]) {
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
		text: params?.text ?? "NOTP-K7F9Q2M8VD",
	};
}

describe("getNotpInputOrNull", () => {
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

	it("should build normalized NOTP input from one case-insensitive code", async () => {
		const result = await getNotpInputOrNull(_createMessage({ text: "Meu código é notp-k7f9q2m8vd." }));

		expect(result).toEqual({
			providerMessageId: "provider-message-id",
			providerSenderId: "provider-sender-id",
			providerContactIdentifier: "+5511999999999",
			notpCodeHash: "a".repeat(64),
		});
	});

	it("should ignore text without an NOTP code", async () => {
		const result = await getNotpInputOrNull(_createMessage({ text: "Olá" }));

		expect(result).toBeNull();
	});

	it("should ignore text containing more than one NOTP code", async () => {
		const result = await getNotpInputOrNull(_createMessage({ text: "NOTP-K7F9Q2M8VD NOTP-AAAAAAAAAA" }));

		expect(result).toBeNull();
	});

	it("should ignore malformed NOTP-like text", async () => {
		const result = await getNotpInputOrNull(_createMessage({ text: "NOTP-INVALID" }));

		expect(result).toBeNull();
	});

	it("should ignore the legacy AUTH code prefix", async () => {
		const result = await getNotpInputOrNull(_createMessage({ text: "AUTH-K7F9Q2M8VD" }));

		expect(result).toBeNull();
	});

	it("should require a contact identifier only after identifying an NOTP code", async () => {
		await expect(getNotpInputOrNull(_createMessage({ providerContactIdentifier: undefined }))).rejects.toThrow(
			"NOTP requires a provider contact identifier",
		);
	});

	it("should accept every ten-character uppercase alphanumeric NOTP suffix", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.string({
					unit: fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"),
					minLength: 10,
					maxLength: 10,
				}),
				async (suffix) => (await getNotpInputOrNull(_createMessage({ text: `NOTP-${suffix}` }))) !== null,
			),
		);
	});
});
