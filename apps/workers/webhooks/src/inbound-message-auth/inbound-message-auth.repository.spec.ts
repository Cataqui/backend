const inboundCallMock = vi.hoisted(() => vi.fn());

vi.mock("@cataqui/api-internal-ingress", () => ({
	inboundCall: inboundCallMock,
}));

import { InboundMessageAuthRepository } from "./inbound-message-auth.repository";

describe("InboundMessageAuthRepository", () => {
	const message = {
		providerMessageId: "provider-message-id",
		providerSenderId: "provider-sender-id",
		providerContactIdentifier: "+5511999999999",
		authCodeHash: "a".repeat(64),
	};

	beforeEach(() => {
		inboundCallMock.mockReset();
	});

	it("should deliver normalized messages through the private API Worker entrypoint", async () => {
		const apiWorker = {} as WebhooksWorkerEnv["API_WORKER"];
		inboundCallMock.mockResolvedValue(new Response(null, { status: 204 }));

		await new InboundMessageAuthRepository().verifyMessages({ apiWorker: apiWorker, messages: [message] });

		expect(inboundCallMock).toHaveBeenCalledWith({
			worker: apiWorker,
			receiver: "verify-whatsapp-auth-message",
			body: message,
		});
	});

	it("should reject an unsuccessful API Worker delivery", async () => {
		inboundCallMock.mockResolvedValue(new Response(null, { status: 500 }));

		await expect(
			new InboundMessageAuthRepository().verifyMessages({
				apiWorker: {} as WebhooksWorkerEnv["API_WORKER"],
				messages: [message],
			}),
		).rejects.toThrow("API Worker rejected WhatsApp authentication");
	});
});
