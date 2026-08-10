import { routeInboundCall } from "./api-container-inbound.router";

function _createValidInboundCall(): { receiver: string; body: unknown } {
	return {
		receiver: "verify-whatsapp-auth-message",
		body: {
			providerMessageId: "wamid.message",
			providerSenderId: "provider-sender-id",
			providerContactIdentifier: "+5511999999999",
			authCodeHash: "a".repeat(64),
		},
	};
}

describe("routeInboundCall", () => {
	it("should deliver a valid manifest receiver body to its derived container path", async () => {
		const deliver = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

		await routeInboundCall({ ..._createValidInboundCall(), deliver: deliver });

		expect(deliver).toHaveBeenCalledWith({
			url: "http://localhost/internal/inbound/verify-whatsapp-auth-message",
			requestOptions: {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					providerMessageId: "wamid.message",
					providerSenderId: "provider-sender-id",
					providerContactIdentifier: "+5511999999999",
					authCodeHash: "a".repeat(64),
				}),
			},
		});
	});

	it("should return the response produced by container delivery", async () => {
		const expectedResponse = new Response(null, { status: 503 });

		const response = await routeInboundCall({
			..._createValidInboundCall(),
			deliver: vi.fn().mockResolvedValue(expectedResponse),
		});

		expect(response).toBe(expectedResponse);
	});

	it("should reject an unregistered receiver", async () => {
		const response = await routeInboundCall({
			receiver: "unknown",
			body: {},
			deliver: vi.fn(),
		});

		expect(response.status).toBe(404);
	});

	it("should reject a receiver body that violates its manifest schema", async () => {
		const response = await routeInboundCall({
			receiver: "verify-whatsapp-auth-message",
			body: { authCodeHash: "plaintext" },
			deliver: vi.fn(),
		});

		expect(response.status).toBe(400);
	});
});
