const inboundCallMock = vi.hoisted(() => vi.fn());

vi.mock("@cataqui/api-internal-ingress", () => ({
	inboundCall: inboundCallMock,
}));

import { NotpRepository } from "./notp.repository";

describe("NotpRepository", () => {
	const message = {
		providerMessageId: "provider-message-id",
		providerSenderId: "provider-sender-id",
		providerContactIdentifier: "+5511999999999",
		notpCodeHash: "a".repeat(64),
	};

	beforeEach(() => {
		inboundCallMock.mockReset();
	});

	it("should deliver normalized messages through the private API Worker entrypoint", async () => {
		const apiWorker = {} as WebhooksWorkerEnv["API_WORKER"];
		inboundCallMock.mockResolvedValue(new Response(null, { status: 204 }));

		await new NotpRepository().verifyMessages({ apiWorker: apiWorker, messages: [message] });

		expect(inboundCallMock).toHaveBeenCalledWith({
			worker: apiWorker,
			receiver: "verify-whatsapp-notp",
			body: message,
		});
	});

	it("should reject an unsuccessful API Worker delivery", async () => {
		inboundCallMock.mockResolvedValue(new Response(null, { status: 500 }));

		await expect(
			new NotpRepository().verifyMessages({
				apiWorker: {} as WebhooksWorkerEnv["API_WORKER"],
				messages: [message],
			}),
		).rejects.toThrow("API Worker rejected WhatsApp NOTP verification");
	});
});
