import { inboundCall } from "./api-container-inbound";

describe("inboundCall", () => {
	it("should send a typed receiver body through the supplied Worker binding", async () => {
		const deliverInbound = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
		const body = {
			providerMessageId: "wamid.message",
			providerSenderId: "provider-sender-id",
			providerContactIdentifier: "+5511999999999",
			authCodeHash: "a".repeat(64),
		};

		await inboundCall({
			worker: { deliverInbound: deliverInbound },
			receiver: "verify-whatsapp-auth-message",
			body: body,
		});

		expect(deliverInbound).toHaveBeenCalledWith({
			receiver: "verify-whatsapp-auth-message",
			body: body,
		});
	});

	it("should return the response produced by the Worker binding", async () => {
		const expectedResponse = new Response(null, { status: 503 });

		const response = await inboundCall({
			worker: { deliverInbound: vi.fn().mockResolvedValue(expectedResponse) },
			receiver: "verify-whatsapp-auth-message",
			body: {
				providerMessageId: "wamid.message",
				providerSenderId: "provider-sender-id",
				providerContactIdentifier: "+5511999999999",
				authCodeHash: "a".repeat(64),
			},
		});

		expect(response).toBe(expectedResponse);
	});
});
